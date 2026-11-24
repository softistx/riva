import { expect, test } from 'bun:test';
import type { Scheduler } from './env';
import {
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from './errors';
import { raceAbort, retryDelay, shouldRetry, sleep } from './retry';

const g = globalThis as { document?: unknown };
const saved = g.document;
const restore = () => {
	if (saved === undefined) delete g.document;
	else g.document = saved;
};

test('a count of retries; failures counts the earlier ones', () => {
	expect(shouldRetry(2, 0, new Error())).toBe(true);
	expect(shouldRetry(2, 1, new Error())).toBe(true);
	expect(shouldRetry(2, 2, new Error())).toBe(false);
	expect(shouldRetry(0, 0, new Error())).toBe(false);
});

test('a function decides', () => {
	expect(shouldRetry((n) => n < 1, 0, 'x')).toBe(true);
	expect(shouldRetry((n) => n < 1, 1, 'x')).toBe(false);
});

test('never retries an abort or a non-retryable request error, even with a function', () => {
	expect(shouldRetry(5, 0, new RivaAbortError())).toBe(false);
	expect(shouldRetry(() => true, 0, new RivaAbortError())).toBe(false);
	expect(shouldRetry(5, 0, new RivaHttpError(404))).toBe(false);
	expect(
		shouldRetry(5, 0, new RivaRequestError('X', 'x', { retryable: false })),
	).toBe(false);
	expect(shouldRetry(5, 0, new RivaHttpError(503))).toBe(true);
	expect(shouldRetry(5, 0, new RivaNetworkError())).toBe(true);
});

test('default count: 0 on the server, 3 in a browser', () => {
	delete g.document;
	expect(shouldRetry(undefined, 0, new Error())).toBe(false);
	g.document = {};
	try {
		expect(shouldRetry(undefined, 2, new Error())).toBe(true);
		expect(shouldRetry(undefined, 3, new Error())).toBe(false);
	} finally {
		restore();
	}
});

test('default delay doubles from 1 s and caps at 30 s', () => {
	expect([0, 1, 2, 3, 4, 5, 6].map((n) => retryDelay(undefined, n))).toEqual([
		1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
	]);
	expect(retryDelay((n) => n * 10, 3)).toBe(30);
});

test('sleep waits for the timer, or ends early on abort', async () => {
	const timers: Array<() => void> = [];
	let cleared = 0;
	const sched: Scheduler = {
		now: () => 0,
		setTimeout: (fn) => timers.push(fn),
		clearTimeout: () => cleared++,
	};
	let done = 0;
	const ctl = new AbortController();
	const p = sleep(sched, 10, ctl.signal).then(() => done++);
	await Promise.resolve();
	expect(done).toBe(0);
	timers[0]?.();
	await p;
	expect(done).toBe(1);
	const ctl2 = new AbortController();
	const p2 = sleep(sched, 10, ctl2.signal);
	ctl2.abort();
	await p2;
	expect(cleared).toBe(2);
	await sleep(sched, 10, ctl2.signal); // already aborted: immediate
	expect(timers.length).toBe(2);
});

test('raceAbort settles with the promise, or rejects on abort even if it never settles', async () => {
	const ctl = new AbortController();
	expect(await raceAbort(Promise.resolve(1), ctl.signal)).toBe(1);
	const never = new Promise<number>(() => {});
	const p = raceAbort(never, ctl.signal);
	ctl.abort();
	await expect(p).rejects.toBeInstanceOf(RivaAbortError);
	await expect(raceAbort(never, ctl.signal)).rejects.toBeInstanceOf(
		RivaAbortError,
	);
	await expect(
		raceAbort(Promise.reject(new Error('x')), new AbortController().signal),
	).rejects.toThrow('x');
});
