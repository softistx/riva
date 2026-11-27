import { expect, test } from 'bun:test';
import { createRiva } from './client';
import { RivaAbortError } from './errors';
import { type FetchContext, query } from './query';

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

const streaming = () => {
	const gate = { release: (_v: string) => {} };
	const ctxs: FetchContext[] = [];
	const q = query<void, string>({
		id: 'stream',
		retry: 0,
		fetch: (_v, ctx) => {
			ctxs.push(ctx);
			return new Promise<string>((r) => {
				gate.release = r;
			});
		},
	});
	return { q, gate, ctxs };
};

test('each part is published as success, streaming, with the data so far', async () => {
	const { q, gate, ctxs } = streaming();
	const riva = createRiva();
	const p = q.ensure(riva);
	expect(riva.get(q)).toMatchObject({ status: 'loading', data: undefined });
	ctxs[0]?.onPart?.('a');
	expect(riva.get(q)).toMatchObject({
		status: 'success',
		data: 'a',
		isFetching: true,
		dataState: 'streaming',
	});
	ctxs[0]?.onPart?.('ab');
	expect(riva.get(q).data).toBe('ab');
	gate.release('abc');
	expect(await p).toBe('abc');
	expect(riva.get(q)).toMatchObject({
		status: 'success',
		data: 'abc',
		isFetching: false,
		dataState: 'complete',
	});
});

test('a plain fetch never sets dataState', async () => {
	const q = query<void, string>({ id: 'plain', fetch: async () => 'x' });
	const riva = createRiva();
	await q.ensure(riva);
	expect('dataState' in riva.get(q)).toBe(false);
});

test('a stream that fails keeps the parts and ends complete with the error', async () => {
	const ctxs: Array<{ onPart?: (d: unknown) => void }> = [];
	let fail = (_e: Error) => {};
	const q = query<void, string>({
		id: 'stream-fail',
		retry: 0,
		fetch: (_v, ctx) => {
			ctxs.push(ctx);
			return new Promise((_, rej) => {
				fail = rej;
			});
		},
	});
	const riva = createRiva();
	const p = q.ensure(riva).catch((e) => e);
	ctxs[0]?.onPart?.('a');
	fail(new Error('cut'));
	await p;
	expect(riva.get(q)).toMatchObject({
		status: 'error',
		data: 'a',
		dataState: 'complete',
	});
});

test('cancel aborts the stream, drops its parts and ignores later ones', async () => {
	const { q, ctxs } = streaming();
	const riva = createRiva();
	const settled = q.ensure(riva).catch((e) => e);
	ctxs[0]?.onPart?.('a');
	q.cancel(riva, undefined);
	expect(await settled).toBeInstanceOf(RivaAbortError);
	expect(ctxs[0]?.signal.aborted).toBe(true);
	ctxs[0]?.onPart?.('late');
	expect(riva.get(q)).toMatchObject({ status: 'idle', data: undefined });
});

test('a restart replaces the stream: parts of the old attempt are dropped', async () => {
	const { q, ctxs, gate } = streaming();
	const riva = createRiva();
	const off = riva.subscribe(q, () => {});
	ctxs[0]?.onPart?.('old');
	q.invalidate(riva);
	await flush();
	expect(ctxs).toHaveLength(2);
	ctxs[0]?.onPart?.('stale part');
	expect(riva.get(q).data).toBe('old');
	ctxs[1]?.onPart?.('new');
	expect(riva.get(q).data).toBe('new');
	gate.release('final');
	await flush();
	expect(riva.get(q)).toMatchObject({ data: 'final', dataState: 'complete' });
	off();
});
