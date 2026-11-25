import type { RivaError } from './errors';
import {
	type AnyQuery,
	armGc,
	type Ctx,
	committed,
	type Entry,
	entryOf,
	INCOMPLETE,
	put,
	type State,
	stale,
	unreadable,
} from './query-entry';
import { abandon, join, pin } from './query-run';
import { isBrowser } from './scope';
import type { Listener, Unsubscribe } from './signal';

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
 * A fetched, observed entry whose stored data the cache can no longer read
 * (an entity evicted) is refetched. A fetch that stays unreadable ends in
 * `error`, which this ignores, so it never loops; once the data reads again
 * that error is cleared.
 */
function complete(c: Ctx, e: Entry, s: State): void {
	if (e.run) return;
	if (s.status === 'success') {
		if (s.data === undefined && unreadable(c, e)) {
			e.invalidated = true;
			pin(c, e);
		}
	} else if (
		s.status === 'error' &&
		(s.error as RivaError | undefined)?.message === INCOMPLETE &&
		committed(c, e) !== undefined
	)
		put(c, e, { status: 'success', error: undefined });
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
	const off = c.riva.subscribe(e.out, (s) => {
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
