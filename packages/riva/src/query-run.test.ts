import { expect, test } from 'bun:test';
import { createRiva } from './client';
import { RivaAbortError } from './errors';
import { query } from './query';

const flush = () => new Promise<void>((r) => setImmediate(r));

test('join shares one fetch among callers; success settles the state', async () => {
	let calls = 0;
	const q = query<void, string>({
		id: 'q',
		fetch: async () => `v${++calls}`,
	});
	const riva = createRiva();
	const [a, b] = await Promise.all([q.ensure(riva), q.ensure(riva)]);
	expect([a, b, calls]).toEqual(['v1', 'v1', 1]);
	expect(riva.get(q)).toMatchObject({
		status: 'success',
		data: 'v1',
		isFetching: false,
	});
});

test('a failure with no retry settles the error state and rejects', async () => {
	const q = query<void, string>({
		id: 'q',
		retry: 0,
		fetch: async () => {
			throw new Error('boom');
		},
	});
	const riva = createRiva();
	await expect(q.ensure(riva)).rejects.toThrow('boom');
	expect(riva.get(q).status).toBe('error');
});

test('cancel aborts the fetch and restores the previous state', async () => {
	let signal: AbortSignal | undefined;
	const q = query<void, string>({
		id: 'q',
		fetch: (_v, ctx) => {
			signal = ctx.signal;
			return new Promise(() => {});
		},
	});
	const riva = createRiva();
	const p = q.ensure(riva);
	const settled = p.catch((e) => e);
	q.cancel(riva, undefined);
	expect(await settled).toBeInstanceOf(RivaAbortError);
	expect(signal?.aborted).toBe(true);
	await flush();
	expect(riva.get(q).status).toBe('idle');
});

test('invalidate while observed restarts the fetch on a new controller', async () => {
	const signals: AbortSignal[] = [];
	const q = query<void, string>({
		id: 'q',
		fetch: (_v, ctx) => {
			signals.push(ctx.signal);
			return signals.length === 1
				? new Promise(() => {})
				: Promise.resolve('fresh');
		},
	});
	const riva = createRiva();
	const off = riva.subscribe(q, () => {});
	q.invalidate(riva);
	await flush();
	expect(signals[0]?.aborted).toBe(true);
	expect(signals.length).toBe(2);
	expect(riva.get(q).data).toBe('fresh');
	off();
});
