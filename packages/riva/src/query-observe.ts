import type { Listener, Unsubscribe } from './atom';
import { RivaError } from './errors';
import {
	type AnyQuery,
	armGc,
	type Ctx,
	type Entry,
	entryOf,
	peek,
	put,
	type State,
	stale,
} from './query-entry';
import { abandon, join, pin } from './query-run';
import { isBrowser } from './scope';

export interface ObserveOptions {
	/** Replaces the definition's `staleTime` for this observer's first fetch decision only (ms). */
	staleTime?: number;
}

function poll(c: Ctx, e: Entry): void {
	const ms = e.def.options.refetchEvery;
	if (isBrowser() && ms !== undefined && ms > 0 && ms < Infinity)
		e.poll = c.sched.setTimeout(() => {
			if (!e.observers) return;
			poll(c, e);
			pin(c, e);
		}, ms);
}

/** Refetches the observed, stale, idle entries that did not opt out. */
function refetch(c: Ctx, flag: 'refetchOnFocus' | 'refetchOnReconnect'): void {
	for (const e of c.entries.values())
		if (e.observers && e.def.options[flag] && !e.run && stale(c, e)) pin(c, e);
}

/**
 * A fetched, observed entry whose stored data the policy cannot read (an
 * entity evicted, a selected field the server left out) is refetched once; a
 * second miss right after is an error, so it never loops.
 */
function complete(c: Ctx, e: Entry, s: State): void {
	if (s.data !== undefined) e.missed = false;
	else if (
		e.def.options.cache &&
		!e.run &&
		s.status === 'success' &&
		peek(c, e).data !== undefined
	) {
		if (e.missed)
			put(c, e, {
				status: 'error',
				error: new RivaError(
					'RIVA_CACHE',
					"The query's result is incomplete in the cache: the server did not return every selected field.",
				),
			});
		else {
			e.missed = true;
			e.invalidated = true;
			pin(c, e);
		}
	}
}

/** Counts an observer, fetches when needed, polls; the returned function undoes it. */
export function observe(
	c: Ctx,
	def: AnyQuery,
	vars: unknown,
	listener: Listener<State>,
	opts?: ObserveOptions,
): Unsubscribe {
	const e = entryOf(c, def, vars);
	c.sched.clearTimeout(e.gc);
	e.gc = undefined;
	if (c.observed++ === 0) {
		const a = c.events.onFocus(() => refetch(c, 'refetchOnFocus'));
		const b = c.events.onReconnect(() => refetch(c, 'refetchOnReconnect'));
		c.detach = () => {
			a();
			b();
		};
	}
	if (e.observers++ === 0) poll(c, e);
	const off = c.client.subscribe(e.out, (s) => {
		listener(s);
		complete(c, e, s);
	});
	if (stale(c, e, opts?.staleTime)) join(c, e);
	let done = false;
	return () => {
		if (done) return;
		done = true;
		off();
		if (--e.observers === 0) {
			c.sched.clearTimeout(e.poll);
			e.poll = undefined;
			abandon(c, e, e.run);
			armGc(c, e);
		}
		if (--c.observed === 0) c.detach?.();
	};
}
