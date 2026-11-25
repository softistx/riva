import { describe, expect, expectTypeOf, test } from 'bun:test';
import { createRiva } from '../client';
import { computed } from '../computed';
import { RivaAbortError, RivaError } from '../errors';
import { at, mutation } from '../mutation';
import { query } from '../query';
import { signal } from '../signal';
import {
	abortable,
	callResource,
	isReactive,
	mutateInvalidating,
	type TrackedInput,
	trackedInput,
} from './input';

describe('isReactive', () => {
	test('is true for a signal and a computed only', () => {
		expect(isReactive(signal(1))).toBe(true);
		expect(isReactive(computed(() => 1))).toBe(true);
		for (const x of [null, undefined, 1, 'signal', {}, { kind: 'x' }, () => 1])
			expect(isReactive(x)).toBe(false);
	});
});

describe('trackedInput', () => {
	test('reads a value, a signal, a computed and a function', () => {
		const riva = createRiva();
		const s = signal({ a: 1 });
		const c = computed(() => ({ a: riva.get(s).a + 1 }));
		expect(trackedInput(riva, { a: 0 })()).toEqual({ a: 0 });
		expect(trackedInput(riva, s)()).toEqual({ a: 1 });
		expect(trackedInput(riva, c)()).toEqual({ a: 2 });
		expect(trackedInput(riva, () => ({ a: 3 }))()).toEqual({ a: 3 });
		expect(trackedInput(riva, undefined)()).toBeUndefined();
		expect(trackedInput(riva, null)()).toBeNull();
	});

	test('follows a signal that changes after the reader was made', () => {
		const riva = createRiva();
		const s = signal(1);
		const read = trackedInput(riva, s);
		riva.set(s, 2);
		expect(read()).toBe(2);
	});

	test('TrackedInput accepts the four forms', () => {
		expectTypeOf<number>().toExtend<TrackedInput<number>>();
		expectTypeOf<() => number>().toExtend<TrackedInput<number>>();
		expectTypeOf(signal(1)).toExtend<TrackedInput<number>>();
		expectTypeOf(computed(() => 1)).toExtend<TrackedInput<number>>();
	});
});

describe('abortable', () => {
	const inner = (result: Promise<number> = Promise.resolve(1)) =>
		({
			state: { status: 'loading' },
			subscribe: () => () => {},
			// biome-ignore lint/suspicious/noThenProperty: a resource is awaitable on purpose
			then: (f: (d: number) => unknown, r?: (e: unknown) => unknown) =>
				result.then(f, r),
		}) as never;

	test('without a signal it is the resource itself', () => {
		const r = inner();
		expect(abortable(r)).toBe(r);
	});

	test('passes a result through, rejects a pending await when the signal aborts', async () => {
		expect(await abortable(inner(), new AbortController().signal)).toBe(1);
		const c = new AbortController();
		const p = Promise.resolve(
			abortable(inner(new Promise(() => {})), c.signal),
		);
		c.abort();
		await expect(p).rejects.toBeInstanceOf(RivaAbortError);
		await expect(
			Promise.resolve(abortable(inner(), c.signal)),
		).rejects.toBeInstanceOf(RivaAbortError);
	});

	test('the abort listener is removed once the wait settles', async () => {
		const sig = new AbortController().signal;
		let added = 0;
		let removed = 0;
		const add = sig.addEventListener.bind(sig);
		const rm = sig.removeEventListener.bind(sig);
		sig.addEventListener = ((...a: Parameters<typeof add>) => {
			added++;
			add(...a);
		}) as never;
		sig.removeEventListener = ((...a: Parameters<typeof rm>) => {
			removed++;
			rm(...a);
		}) as never;
		expect(await abortable(inner(), sig)).toBe(1);
		await expect(
			Promise.resolve(abortable(inner(Promise.reject(new Error('x'))), sig)),
		).rejects.toThrow('x');
		expect([added, removed]).toEqual([2, 2]);
	});
});

describe('callResource', () => {
	const setup = () => {
		let n = 0;
		const q = query<{ k: number }, string>({
			id: 'q',
			retry: 0,
			fetch: async ({ k }) => `v${k}#${++n}`,
		});
		return { q, riva: createRiva() };
	};

	test('is a resource over the definition and the read variables', async () => {
		const { q, riva } = setup();
		const r = callResource(riva, q as never, () => ({ k: 1 }));
		expect(await r).toBe('v1#1');
	});

	test('disabled by `enabled: false`: idle, and awaiting rejects', async () => {
		const { q, riva } = setup();
		const r = callResource(riva, q as never, () => ({ k: 1 }), {
			enabled: false,
		});
		expect(r.state.status).toBe('idle');
		await expect(Promise.resolve(r)).rejects.toBeInstanceOf(RivaError);
	});

	test('a signal stops the wait of await', async () => {
		const { q, riva } = setup();
		const c = new AbortController();
		c.abort();
		await expect(
			Promise.resolve(
				callResource(riva, q as never, () => ({ k: 1 }), { signal: c.signal }),
			),
		).rejects.toBeInstanceOf(RivaAbortError);
	});
});

describe('mutateInvalidating', () => {
	const setup = () => {
		const log: string[] = [];
		const spy = {
			id: 'q',
			invalidate: (_r: unknown, vars?: unknown) =>
				log.push(vars === undefined ? 'all' : `entry:${JSON.stringify(vars)}`),
		} as unknown as ReturnType<typeof query<{ k: number }, number>>;
		const m = mutation<string, string>({
			id: 'm',
			run: async (v) => {
				log.push('run');
				return v;
			},
		});
		return { spy, m, riva: createRiva(), log };
	};
	const same = (t: unknown) => t as never;

	test('runs the mutation, then marks stale the queries and entries named', async () => {
		const { spy, m, riva, log } = setup();
		const data = await mutateInvalidating(
			riva,
			m as never,
			'x',
			{ invalidates: [spy, at(spy, { k: 1 })] },
			same,
		);
		expect(data).toBe('x');
		expect(log).toEqual(['run', 'all', 'entry:{"k":1}']);
	});

	test('target maps an entry that is neither a query nor an invalidation', async () => {
		const { spy, m, riva, log } = setup();
		await mutateInvalidating(
			riva,
			m as never,
			'x',
			{ invalidates: ['/q'] },
			() => spy as never,
		);
		expect(log).toEqual(['run', 'all']);
	});

	test('resolves every entry first: a bad one throws before the mutation runs', async () => {
		const { spy, m, riva, log } = setup();
		await expect(
			mutateInvalidating(
				riva,
				m as never,
				'x',
				{ invalidates: [spy, 'bad'] },
				(t) => {
					if (t === 'bad') throw new Error('bad entry');
					return t as never;
				},
			),
		).rejects.toThrow('bad entry');
		expect(log).toEqual([]);
	});

	test('invalidates nothing when the mutation fails', async () => {
		const { spy, riva, log } = setup();
		const bad = mutation<string, string>({
			id: 'bad',
			run: async () => {
				throw new Error('no');
			},
		});
		await expect(
			mutateInvalidating(riva, bad as never, 'x', { invalidates: [spy] }, same),
		).rejects.toThrow('no');
		expect(log).toEqual([]);
	});

	test('passes the signal to the mutation', async () => {
		const { riva } = setup();
		let seen: AbortSignal | undefined;
		const m = mutation<string, string>({
			id: 's',
			run: async (v, ctx) => {
				seen = ctx.signal;
				return v;
			},
		});
		const c = new AbortController();
		await mutateInvalidating(riva, m as never, 'x', { signal: c.signal }, same);
		expect(seen).toBeDefined();
	});
});
