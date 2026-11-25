import { RivaAbortError, RivaError } from './errors';
import {
	armGc,
	type Ctx,
	type Entry,
	INCOMPLETE,
	type Inflight,
	peek,
	put,
	putData,
	type State,
	unreadable,
	view,
} from './query-entry';
import { raceAbort, retryDelay, shouldRetry, sleep } from './retry';

const noop = () => {};

/** Fetch, retry with backoff, restart on a new controller; ends with the value or the error. */
async function loop(c: Ctx, e: Entry, f: Inflight): Promise<unknown> {
	const { fetch, retry, retryDelay: delay } = e.def.options;
	for (let failures = 0; ; ) {
		const ctl = f.ctl;
		let ok = false;
		let v: unknown;
		try {
			v = await raceAbort(
				fetch(e.vars, { signal: ctl.signal, client: c.client }),
				ctl.signal,
			);
			ok = true;
		} catch (x) {
			v = x;
		}
		if (!ctl.signal.aborted) {
			if (ok) return v;
			if (!shouldRetry(retry, failures, v)) throw v;
			await sleep(c.sched, retryDelay(delay, failures++), ctl.signal);
		}
		if (ctl.signal.aborted) {
			if (ctl === f.ctl) throw new RivaAbortError(); // cancelled
			failures = 0; // restarted: a fresh attempt
		}
	}
}

/** Starts the one fetch of an entry and settles its state. */
function start(c: Ctx, e: Entry): Inflight {
	const f: Inflight = {
		promise: undefined as unknown as Promise<unknown>,
		ctl: new AbortController(),
		waiters: 0,
		pinned: false,
		set: undefined,
		prev: peek(c, e),
	};
	e.run = f;
	put(c, e, {
		status: f.prev.status === 'success' ? 'success' : 'pending',
		error: undefined,
		isFetching: true,
	});
	// A cancelled fetch (no longer `e.run`) writes nothing.
	const done = (patch: Partial<State>): unknown => {
		if (e.run !== f) return;
		e.run = undefined;
		e.invalidated = false;
		const refused = putData(c, e, { isFetching: false, ...patch });
		armGc(c, e);
		return refused;
	};
	f.promise = loop(c, e, f).then(
		(data) => {
			// One change for readers: the data and, when the cache cannot read it, the error.
			let refused: unknown;
			c.client.batch(() => {
				const mine = e.run === f;
				refused = done({
					status: 'success',
					data,
					error: undefined,
					updatedAt: c.sched.now(),
				});
				if (!refused && mine && data !== undefined && unreadable(c, e)) {
					refused = new RivaError('RIVA_CACHE', INCOMPLETE);
					put(c, e, { status: 'error', error: refused });
				}
			});
			if (refused) throw refused;
			return e.def.options.cache ? (view(c, e).data ?? data) : data;
		},
		(error) => {
			if (f.set) return f.set.v;
			done({ status: 'error', error });
			throw error;
		},
	);
	f.promise.catch(noop); // each caller handles its own copy
	return f;
}

/** The fetch in flight, or a new one. Callers that do not await it ignore its rejection. */
export const join = (c: Ctx, e: Entry): Inflight => e.run ?? start(c, e);

/** `join` for a fetch nobody awaits (prefetch, poll, refetch): pinned, so a caller's abort leaves it running. */
export const pin = (c: Ctx, e: Entry): void => {
	join(c, e).pinned = true;
};

/** Aborts the fetch, rejects its waiters and restores the previous state. */
export function cancel(c: Ctx, e: Entry): void {
	const f = e.run;
	if (!f) return;
	e.run = undefined;
	f.ctl.abort();
	put(c, e, f.prev);
	armGc(c, e);
}

/** Aborts the attempt and starts a fresh one; waiters get its result. */
export function restart(f: Inflight): void {
	const old = f.ctl;
	f.ctl = new AbortController();
	old.abort();
}

/** Cancels a fetch nobody waits for or observes any more. */
export function abandon(c: Ctx, e: Entry, f: Inflight | undefined): void {
	if (f && e.run === f && !f.waiters && !f.pinned && !e.observers) cancel(c, e);
}
