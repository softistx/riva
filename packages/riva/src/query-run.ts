import { noop } from './env';
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
	putStored,
	releaseKept,
	type State,
	unreadable,
	view,
} from './query-entry';
import { raceAbort, retryDelay, shouldRetry, sleep } from './retry';

/** Fetch, retry with backoff, restart on a new controller; ends with the value or the error. */
async function loop(c: Ctx, e: Entry, f: Inflight): Promise<unknown> {
	const { fetch, retry, retryDelay: delay } = e.def.options;
	for (let failures = 0; ; ) {
		const ctl = f.ctl;
		// A part of an aborted attempt (cancel, restart, replaced) is dropped.
		const onPart = (data: unknown) => {
			if (ctl.signal.aborted || e.run !== f) return;
			f.parted = true;
			// The data the run replaces stays stored until it settles: a cancel restores it.
			putData(
				c,
				e,
				{ status: 'success', data, dataState: 'streaming' },
				f.prev.data,
			);
		};
		let ok = false;
		let v: unknown;
		try {
			v = await raceAbort(
				fetch(e.vars, {
					signal: ctl.signal,
					riva: c.riva,
					keep: (s) => (e.stop = s),
					onPart,
				}),
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
		prev: peek(c, e),
	};
	e.stop?.();
	e.run = f;
	put(c, e, {
		status: f.prev.status === 'success' ? 'success' : 'loading',
		error: undefined,
		isFetching: true,
	});
	// A cancelled fetch (no longer `e.run`) writes nothing.
	const done = (patch: Partial<State>): unknown => {
		if (e.run !== f) return;
		e.run = undefined;
		// A stream closed for want of an observer leaves the entry stale.
		e.invalidated = !e.observers && !!e.stop?.();
		const refused = putData(c, e, {
			isFetching: false,
			...(peek(c, e).dataState && { dataState: 'complete' as const }),
			...patch,
		});
		// The run is over: the data it kept for a cancel is not needed any more.
		releaseKept(c, e, f, peek(c, e).data);
		armGc(c, e);
		return refused;
	};
	f.promise = loop(c, e, f).then(
		(data) => {
			// One change for readers: the data and, when the cache cannot read it, the error.
			let refused: unknown;
			c.riva.batch(() => {
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
			if (f.set) {
				// A value pushed in the tick the fetch resolved: the run ended in `setData`.
				if (!e.run && !e.observers && e.stop?.()) e.invalidated = true;
				armGc(c, e);
				return f.set.v;
			}
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
	// Releases the last part a stream stored; the previous data was kept.
	// `dataState` is written even when absent: a part's `streaming` must not outlive the run.
	putStored(c, e, { ...f.prev, dataState: f.prev.dataState } as Partial<State>);
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
