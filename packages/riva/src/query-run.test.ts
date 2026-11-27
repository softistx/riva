import { expect, test } from 'bun:test';
import { createRiva } from './client';
import { entities } from './entities';
import { storeOf } from './entities/policy';
import { RivaAbortError } from './errors';
import { type FetchContext, query } from './query';
import { dehydrate, hydrate } from './ssr';

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

test('a part published after the fetch settled is ignored', async () => {
	const { q, ctxs, gate } = streaming();
	const riva = createRiva();
	const p = q.ensure(riva);
	ctxs[0]?.onPart?.('a');
	gate.release('final');
	await p;
	ctxs[0]?.onPart?.('late');
	expect(riva.get(q)).toMatchObject({
		data: 'final',
		isFetching: false,
		dataState: 'complete',
	});
});

test('cancel of a streaming refetch restores the previous entity data, still readable', async () => {
	const ctxs: FetchContext[] = [];
	let calls = 0;
	const q = query<void, { id: string; name: string }>({
		id: 'cancel-entities',
		retry: 0,
		cache: entities({ identify: (o) => `P:${(o as { id: string }).id}` }),
		fetch: (_v, ctx) => {
			ctxs.push(ctx);
			return calls++ === 0
				? Promise.resolve({ id: '1', name: 'Ann' })
				: new Promise(() => {});
		},
	});
	const riva = createRiva();
	await q.ensure(riva);
	q.invalidate(riva);
	const settled = q.ensure(riva).catch((e) => e);
	ctxs[1]?.onPart?.({ id: '2', name: 'Bob' });
	expect(riva.get(q).data).toEqual({ id: '2', name: 'Bob' });
	q.cancel(riva, undefined);
	await settled;
	expect(riva.get(q).data).toEqual({ id: '1', name: 'Ann' });
	expect([...storeOf(riva).signals.keys()]).toContain('P:1');
	expect([...storeOf(riva).signals.keys()]).not.toContain('P:2');
});

test('a streaming refetch that completes releases the previous data and the parts', async () => {
	const ctxs: FetchContext[] = [];
	let calls = 0;
	const gate = { release: (_v: { id: string; name: string }) => {} };
	const q = query<void, { id: string; name: string }>({
		id: 'done-entities',
		retry: 0,
		cache: entities({ identify: (o) => `P:${(o as { id: string }).id}` }),
		fetch: (_v, ctx) => {
			ctxs.push(ctx);
			return calls++ === 0
				? Promise.resolve({ id: '1', name: 'Ann' })
				: new Promise((r) => {
						gate.release = r;
					});
		},
	});
	const riva = createRiva();
	await q.ensure(riva);
	q.invalidate(riva);
	const p = q.ensure(riva);
	ctxs[1]?.onPart?.({ id: '2', name: 'Bob' });
	gate.release({ id: '3', name: 'Cy' });
	await p;
	expect([...storeOf(riva).signals.keys()]).toEqual(['P:3']);
});

test('cancel and setData mid-stream do not leave dataState streaming', async () => {
	const a = streaming();
	const r2 = createRiva();
	const settled = a.q.ensure(r2).catch((e) => e);
	a.ctxs[0]?.onPart?.('a');
	a.q.cancel(r2, undefined);
	await settled;
	expect(r2.get(a.q).dataState).toBeUndefined();
	const b = streaming();
	const r3 = createRiva();
	const s3 = b.q.ensure(r3).catch((e) => e);
	b.ctxs[0]?.onPart?.('a');
	b.q.setData(r3, undefined, 'set');
	await s3;
	expect(r3.get(b.q)).toMatchObject({ data: 'set', dataState: 'complete' });
	expect(dehydrate(r3).q).toHaveLength(1);
});

test('a hydrate in the middle of a run with no parts releases the replaced data once', async () => {
	const log: string[] = [];
	const cache = {
		write: (_c: unknown, d: unknown) => ({ boxed: d as number }),
		read: (_c: unknown, s: { boxed: number }) => s.boxed,
		release: (_c: unknown, s: { boxed: number }) =>
			void log.push(`release ${s.boxed}`),
	};
	let calls = 0;
	let gate = (_v: number) => {};
	const q = query<void, number>({
		id: 'hydrate-mid-run',
		retry: 0,
		cache,
		fetch: () =>
			++calls <= 2
				? Promise.resolve(1)
				: new Promise<number>((r) => {
						gate = r;
					}),
	});
	const server = createRiva();
	await q.ensure(server);
	const snap = JSON.parse(JSON.stringify(dehydrate(server)));
	log.length = 0;
	const riva = createRiva();
	await q.ensure(riva);
	q.invalidate(riva);
	const p = q.ensure(riva);
	hydrate(riva, snap);
	gate(2);
	await p;
	expect(log.filter((x) => x === 'release 1')).toHaveLength(1);
});
