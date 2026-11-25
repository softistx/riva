import { expect, test } from 'bun:test';
import { createRivaClient } from './client';
import { RivaAbortError } from './errors';
import { query } from './query';

const flush = () => new Promise<void>((r) => setImmediate(r));

test('join shares one fetch among callers; success settles the state', async () => {
	let calls = 0;
	const q = query<void, string>({
		id: 'q',
		fetch: async () => `v${++calls}`,
	});
	const client = createRivaClient();
	const [a, b] = await Promise.all([q.ensure(client), q.ensure(client)]);
	expect([a, b, calls]).toEqual(['v1', 'v1', 1]);
	expect(client.get(q)).toMatchObject({
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
	const client = createRivaClient();
	await expect(q.ensure(client)).rejects.toThrow('boom');
	expect(client.get(q).status).toBe('error');
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
	const client = createRivaClient();
	const p = q.ensure(client);
	const settled = p.catch((e) => e);
	q.cancel(client, undefined);
	expect(await settled).toBeInstanceOf(RivaAbortError);
	expect(signal?.aborted).toBe(true);
	await flush();
	expect(client.get(q).status).toBe('idle');
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
	const client = createRivaClient();
	const off = client.subscribe(q, () => {});
	q.invalidate(client);
	await flush();
	expect(signals[0]?.aborted).toBe(true);
	expect(signals.length).toBe(2);
	expect(client.get(q).data).toBe('fresh');
	off();
});
