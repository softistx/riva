import type { RivaClient } from './client';
import type { ClientEvents, Scheduler } from './env';
import { RivaAbortError } from './errors';
import { stableKey } from './key';
import type { EnsureOptions, Query, QueryState } from './query';
import {
	type AnyQuery,
	armGc,
	type Ctx,
	committed,
	type Entry,
	entryOf,
	type Lay,
	peek,
	put,
	putStored,
	stale,
	toStored,
	unreadable,
	view,
} from './query-entry';
import { type ObserveOptions, observe } from './query-observe';
import { abandon, cancel, join, pin, restart } from './query-run';
import { raceAbort } from './retry';
import type { Listener } from './signal';

function mark(c: Ctx, e: Entry): void {
	e.invalidated = true;
	if (e.run) restart(e.run);
	else if (e.observers) join(c, e);
}

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
		sched,
		/** The entries' shared context. @internal */
		ctx: c,
		/** An optimistic layer over an entry; returns its drop. @internal */
		lay(def: AnyQuery, vars: unknown, l: Lay): () => void {
			const e = entryOf(c, def, vars);
			client.set(e.lay, (ls) => [...ls, l]);
			return () => client.set(e.lay, (ls) => ls.filter((x) => x !== l));
		},
		/** A pure, tracked read: creates an idle entry, never fetches. */
		// biome-ignore lint/suspicious/noExplicitAny: variables are typed by the caller
		state: <D>(def: Query<any, D>, vars: unknown): QueryState<D> =>
			client.get(entryOf(c, def, vars).out) as QueryState<D>,

		ensure<V, D>(def: Query<V, D>, vars: V, opts?: EnsureOptions): Promise<D> {
			const signal = opts?.signal;
			if (signal?.aborted) return Promise.reject(new RivaAbortError());
			const e = entryOf(c, def, vars);
			if (!stale(c, e)) return Promise.resolve(view(c, e).data as D);
			const f = join(c, e);
			f.waiters++;
			return (signal ? raceAbort(f.promise, signal) : f.promise).finally(() => {
				f.waiters--;
				if (signal?.aborted) abandon(c, e, f);
			}) as Promise<D>;
		},

		prefetch(def: AnyQuery, vars: unknown): void {
			const e = entryOf(c, def, vars);
			if (stale(c, e)) pin(c, e);
		},

		/** Starts a fetch only when the stored data cannot be read (an evicted entity); @internal */
		missing(def: AnyQuery, vars: unknown): void {
			const e = entryOf(c, def, vars);
			if (unreadable(c, e)) pin(c, e);
		},

		/** One entry, or every entry of the definition when `vars` is undefined. */
		invalidate(def: AnyQuery, vars?: unknown): void {
			const key = vars === undefined ? undefined : stableKey(def.id, vars);
			for (const e of [...c.entries.values()])
				if (e.def.id === def.id && (key === undefined || e.key === key))
					mark(c, e);
		},

		/** Invalidates every entry whose stored data the cache policy's test matches. @internal */
		invalidateBy(test: (stored: unknown) => boolean): void {
			for (const e of [...c.entries.values()]) {
				const stored = peek(c, e).data;
				if (stored !== undefined && e.def.options.cache && test(stored))
					mark(c, e);
			}
		},

		setData<D>(
			// biome-ignore lint/suspicious/noExplicitAny: variables are typed by the caller
			def: Query<any, D>,
			vars: unknown,
			data: D | ((prev: D | undefined) => D),
		): void {
			const e = entryOf(c, def, vars);
			const f = e.run;
			client.batch(() => {
				const value =
					typeof data === 'function'
						? (data as (prev: D | undefined) => D)(committed(c, e) as D)
						: data;
				// A refused value throws here, before anything changed.
				const stored = toStored(c, e, value);
				if (f) {
					e.run = undefined;
					f.set = { v: value };
					f.ctl.abort();
				}
				e.invalidated = false;
				putStored(c, e, {
					status: 'success',
					data: stored,
					error: undefined,
					isFetching: false,
					updatedAt: sched.now(),
				});
			});
			armGc(c, e);
		},

		/** Whether the entry was invalidated and not refetched since. @internal */
		invalid: (def: AnyQuery, vars: unknown): boolean =>
			c.entries.get(stableKey(def.id, vars))?.invalidated ?? false,

		/** Sets an error on an entry and keeps its data (a failed side fetch). @internal */
		fail(def: AnyQuery, vars: unknown, error: unknown): void {
			put(c, entryOf(c, def, vars), { status: 'error', error });
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
			opts?: ObserveOptions,
		) => observe(c, def, vars, listener as Listener<QueryState<unknown>>, opts),
	};
}

export type QueryCache = ReturnType<typeof createQueryCache>;
