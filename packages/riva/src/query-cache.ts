import type { Listener } from './atom';
import type { RivaClient } from './client';
import type { ClientEvents, Scheduler } from './env';
import { RivaAbortError } from './errors';
import { stableKey } from './key';
import type { EnsureOptions, Query, QueryState } from './query';
import {
	type AnyQuery,
	type Ctx,
	entryOf,
	peek,
	put,
	stale,
} from './query-entry';
import { observe } from './query-observe';
import { abandon, cancel, join, restart } from './query-run';
import { raceAbort } from './retry';

/** The query entries of one client: the operations the definitions and the client call. */
export function createQueryCache(
	client: RivaClient,
	sched: Scheduler,
	events: ClientEvents,
) {
	const c: Ctx = {
		client,
		sched,
		events,
		entries: new Map(),
		observed: 0,
		detach: undefined,
	};
	return {
		/** A pure, tracked read: creates an idle entry, never fetches. */
		// biome-ignore lint/suspicious/noExplicitAny: variables are typed by the caller
		state: <D>(def: Query<any, D>, vars: unknown): QueryState<D> =>
			client.get(entryOf(c, def, vars).atom) as QueryState<D>,

		ensure<V, D>(def: Query<V, D>, vars: V, opts?: EnsureOptions): Promise<D> {
			const signal = opts?.signal;
			if (signal?.aborted) return Promise.reject(new RivaAbortError());
			const e = entryOf(c, def, vars);
			if (!stale(c, e)) return Promise.resolve(peek(c, e).data as D);
			const f = join(c, e);
			f.waiters++;
			return (signal ? raceAbort(f.promise, signal) : f.promise).finally(() => {
				f.waiters--;
				if (signal?.aborted) abandon(c, e, f);
			}) as Promise<D>;
		},

		prefetch(def: AnyQuery, vars: unknown): void {
			const e = entryOf(c, def, vars);
			if (stale(c, e)) join(c, e);
		},

		/** One entry, or every entry of the definition when `vars` is undefined. */
		invalidate(def: AnyQuery, vars?: unknown): void {
			const key = vars === undefined ? undefined : stableKey(def.id, vars);
			for (const e of [...c.entries.values()]) {
				if (e.def.id !== def.id || (key !== undefined && e.key !== key))
					continue;
				e.invalidated = true;
				if (e.observers) e.run ? restart(e.run) : join(c, e);
			}
		},

		setData<D>(
			// biome-ignore lint/suspicious/noExplicitAny: variables are typed by the caller
			def: Query<any, D>,
			vars: unknown,
			data: D | ((prev: D | undefined) => D),
		): void {
			const e = entryOf(c, def, vars);
			cancel(c, e);
			e.invalidated = false;
			put(c, e, {
				status: 'success',
				data:
					typeof data === 'function'
						? (data as (prev: D | undefined) => D)(peek(c, e).data as D)
						: data,
				error: undefined,
				isFetching: false,
				updatedAt: sched.now(),
			});
		},

		cancel(def: AnyQuery, vars: unknown): void {
			const e = c.entries.get(stableKey(def.id, vars));
			if (e) cancel(c, e);
		},

		observe: <D>(
			// biome-ignore lint/suspicious/noExplicitAny: variables are typed by the caller
			def: Query<any, D>,
			vars: unknown,
			listener: Listener<QueryState<D>>,
		) => observe(c, def, vars, listener as Listener<QueryState<unknown>>),
	};
}

export type QueryCache = ReturnType<typeof createQueryCache>;
