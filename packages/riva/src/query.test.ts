import { expect, expectTypeOf, test } from 'bun:test';
import { createRivaClient } from './client';
import { RivaError } from './errors';
import { type Query, type QueryState, query } from './query';

test('a definition is frozen, stateless and resolves its durations', () => {
	const q = query({
		id: 'q',
		staleTime: '30s',
		gcTime: '1m',
		refetchEvery: '5s',
		fetch: async () => 1,
	});
	expect(Object.isFrozen(q)).toBe(true);
	expect(q.kind).toBe('query');
	expect(q.id).toBe('q');
	expect(q.options).toMatchObject({
		staleTime: 30_000,
		gcTime: 60_000,
		refetchEvery: 5000,
		refetchOnFocus: true,
		refetchOnReconnect: true,
	});
	const d = query({ id: 'd', fetch: async () => 1 });
	expect(d.options).toMatchObject({
		staleTime: 0,
		gcTime: undefined,
		refetchEvery: undefined,
	});
});

test('a bad duration fails at definition time', () => {
	expect(() =>
		query({ id: 'q', staleTime: '5d' as never, fetch: async () => 1 }),
	).toThrow(RivaError);
});

test('variables are optional when void', async () => {
	const c = createRivaClient();
	const q = query({ id: 'q', fetch: async () => 'v' });
	expect(await q.ensure(c)).toBe('v');
	expect(c.get(q).data).toBe('v');
	q.invalidate(c);
	q.cancel(c);
	q.prefetch(c);
});

test('types: Vars and Data are inferred; void vars optional; wrong vars rejected', async () => {
	const c = createRivaClient();
	const q = query({
		id: 'q',
		fetch: async (v: { id: string }) => ({ n: v.id.length }),
	});
	expectTypeOf(q).toEqualTypeOf<Query<{ id: string }, { n: number }>>();
	const pending = q.ensure(c, { id: 'a' });
	pending.catch(() => {}); // the unsubscribe below cancels it
	expectTypeOf(pending).toEqualTypeOf<Promise<{ n: number }>>();
	expectTypeOf(c.get(q, { id: 'a' })).toEqualTypeOf<
		QueryState<{ n: number }>
	>();
	expectTypeOf(c.get(q, { id: 'a' }).data).toEqualTypeOf<
		{ n: number } | undefined
	>();
	c.subscribe(q, { id: 'a' }, (s) =>
		expectTypeOf(s).toEqualTypeOf<QueryState<{ n: number }>>(),
	)();
	q.setData(c, { id: 'a' }, (prev) => prev ?? { n: 0 });
	q.invalidate(c);
	q.invalidate(c, { id: 'a' });
	await q.ensure(c, { id: 'a' }, { signal: new AbortController().signal });
	const rejected = () => {
		// @ts-expect-error variables are required
		q.ensure(c);
		// @ts-expect-error wrong variables
		q.ensure(c, { id: 1 });
		// @ts-expect-error wrong variables
		c.get(q, { nope: true });
		// @ts-expect-error wrong data
		q.setData(c, { id: 'a' }, { n: 'x' });
	};
	expect(typeof rejected).toBe('function');

	const v = query({ id: 'v', fetch: async () => [1, 2] });
	expectTypeOf(v).toEqualTypeOf<Query<void, number[]>>();
	expectTypeOf(v.ensure(c)).toEqualTypeOf<Promise<number[]>>();
	expectTypeOf(c.get(v)).toEqualTypeOf<QueryState<number[]>>();
	const off = c.subscribe(v, (s) =>
		expectTypeOf(s.data).toEqualTypeOf<number[] | undefined>(),
	);
	off();
	await v.ensure(c, undefined, { signal: new AbortController().signal });
	const notAClient = () => {
		// @ts-expect-error not a client
		v.ensure({});
	};
	expect(typeof notAClient).toBe('function');
});
