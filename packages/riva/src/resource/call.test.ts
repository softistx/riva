import { describe, expect, expectTypeOf, test } from 'bun:test';
import { createRiva } from '../client';
import { RivaAbortError, RivaError } from '../errors';
import { at, type Mutation, mutation } from '../mutation';
import { type Query, query } from '../query';
import { callResource, mutateInvalidating } from './call';
import type { Resource } from './resource';

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
			mutate: async (v) => {
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
			mutate: async () => {
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
			mutate: async (v, ctx) => {
				seen = ctx.signal;
				return v;
			},
		});
		const c = new AbortController();
		await mutateInvalidating(riva, m as never, 'x', { signal: c.signal }, same);
		expect(seen).toBeDefined();
	});
});

describe('types', () => {
	test('callResource follows the definition and its variables', () => {
		const q = query<{ k: number }, string>({ id: 't', fetch: async () => '' });
		const riva = createRiva();
		expectTypeOf(callResource(riva, q, () => ({ k: 1 }))).toEqualTypeOf<
			Resource<string>
		>();
		// @ts-expect-error variables of another shape
		callResource(riva, q, () => ({ k: 'x' }));
	});

	test('mutateInvalidating follows the definition, its variables and its data', () => {
		const m = mutation<{ id: number }, string>({
			id: 'tm',
			mutate: async () => '',
		});
		const riva = createRiva();
		expectTypeOf(
			mutateInvalidating(riva, m, { id: 1 }, undefined, (t) => t as never),
		).toEqualTypeOf<Promise<string>>();
		// @ts-expect-error variables of another shape
		mutateInvalidating(riva, m, { id: 'x' }, undefined, (t) => t as never);
		expectTypeOf<Query<unknown, unknown>>().not.toBeAny();
		expectTypeOf<Mutation<unknown, unknown>>().not.toBeAny();
	});
});
