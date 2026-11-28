import { expect, test } from 'bun:test';
import { createRiva, query, type Scheduler } from '@softistx/riva';
import { liveQuery } from '@softistx/riva/rxjs';
import { Observable, Subject } from 'rxjs';
import { deferred, newRiva } from '../test/render';
import { handoff, retryOnReset, suspend } from './suspend';

test('the same riva and key get the same promise until it settles', async () => {
	const gate = deferred<number>();
	let calls = 0;
	const q = query<{ id: number }, number>({
		id: 'suspend/a',
		retry: 0,
		fetch: () => {
			calls++;
			return gate.promise;
		},
	});
	const riva = newRiva();
	const a = suspend(riva, q, 'k', { id: 1 });
	expect(suspend(riva, q, 'k', { id: 1 })).toBe(a);
	expect(calls).toBe(1);
	gate.resolve(1);
	await a;
	expect(suspend(riva, q, 'k', { id: 1 })).not.toBe(a);
});

test('another riva never shares the promise', () => {
	const q = query<void, number>({
		id: 'suspend/b',
		retry: 0,
		fetch: () => new Promise(() => {}),
	});
	const a = newRiva();
	const b = newRiva();
	expect(suspend(a, q, 'k', undefined)).not.toBe(suspend(b, q, 'k', undefined));
});

test('a failed fetch resolves the promise: the error is read from the state', async () => {
	const q = query<void, number>({
		id: 'suspend/c',
		retry: 0,
		fetch: () => Promise.reject(new Error('boom')),
	});
	const riva = newRiva();
	await suspend(riva, q, 'k', undefined);
	expect(riva.get(q).status).toBe('error');
});

test('retryOnReset throws an error once, then retries after a later task, once', async () => {
	const riva = newRiva();
	const err = new Error('x');
	expect(retryOnReset(riva, err)).toBe(false);
	expect(retryOnReset(riva, err)).toBe(false); // the synchronous render retry
	await new Promise((r) => setTimeout(r, 0));
	expect(retryOnReset(riva, err)).toBe(true); // a reset
	expect(retryOnReset(riva, err)).toBe(false); // recorded afresh
	expect(retryOnReset(riva, new Error('y'))).toBe(false); // a new error starts over
});

test('an error read again after the tick counts as a reset, even from a late second reader', async () => {
	const riva = newRiva();
	const err = new Error('x');
	expect(retryOnReset(riva, err)).toBe(false);
	await new Promise((r) => setTimeout(r, 5));
	expect(retryOnReset(riva, err)).toBe(true); // one extra fetch, never a loop
	expect(retryOnReset(riva, err)).toBe(false);
});

function fakeScheduler() {
	let t = 0;
	let id = 0;
	const timers = new Map<number, { at: number; fn: () => void }>();
	const sched: Scheduler & { advance(ms: number): void } = {
		now: () => t,
		setTimeout(fn, ms) {
			timers.set(++id, { at: t + ms, fn });
			return id;
		},
		clearTimeout: (h) => void timers.delete(h as number),
		advance(ms) {
			t += ms;
			for (const [k, x] of [...timers])
				if (x.at <= t) {
					timers.delete(k);
					x.fn();
				}
		},
	};
	return sched;
}

function live(id: string, gcTime?: '1m') {
	const feed = new Subject<number>();
	let closed = 0;
	const def = liveQuery<void, number>({
		id,
		retry: 0,
		...(gcTime ? { gcTime } : {}),
		observe: () =>
			new Observable<number>((sub) => {
				const s = feed.subscribe(sub);
				return () => {
					closed++;
					s.unsubscribe();
				};
			}),
	});
	return { def, feed, closed: () => closed };
}

test('a component that never mounts releases the watcher at the entry gcTime, on the scheduler', async () => {
	const sched = fakeScheduler();
	const riva = createRiva({ scheduler: sched });
	const { def, feed, closed } = live('suspend/cap', '1m');
	const p = suspend(riva, def, 'k', undefined);
	feed.next(1);
	await p;
	sched.advance(59_000);
	expect(closed()).toBe(0);
	sched.advance(2_000);
	expect(closed()).toBe(1);
});

test('another observer takes the entry over: the watcher is released with no timer to wait for', async () => {
	const sched = fakeScheduler();
	const riva = createRiva({ scheduler: sched });
	const { def, feed, closed } = live('suspend/handoff', '1m');
	const p = suspend(riva, def, 'k', undefined);
	feed.next(1);
	await p;
	sched.advance(30_000);
	expect(closed()).toBe(0);
	const off = riva.subscribe(def, undefined, () => {});
	handoff(riva, 'k');
	expect(closed()).toBe(0); // the stream stays open under the new observer
	handoff(riva, 'k'); // idempotent
	off();
	expect(closed()).toBe(1);
});
