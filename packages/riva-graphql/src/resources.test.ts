import { describe, expect, test } from 'bun:test';
import { RivaAbortError } from '@softistx/riva';
import type { Resource, ResourceState } from '@softistx/riva/resource';
import { GraphQLError } from './errors';
import { graphqlResource, memoFactory } from './resources';

describe('memoFactory', () => {
	test('equal variables keep the same factory, others make a new one', () => {
		let made = 0;
		const of = memoFactory('x', () => ++made);
		const a = of({ k: 1, j: [1] });
		expect(of({ j: [1], k: 1 })).toBe(a);
		expect(made).toBe(1);
		expect(of({ k: 2 })).not.toBe(a);
	});
});

describe('graphqlResource', () => {
	const inner = (state: ResourceState<number>, result?: Promise<number>) =>
		({
			state,
			subscribe: (l: (s: ResourceState<number>) => void) => {
				l(state);
				return () => {};
			},
			// biome-ignore lint/suspicious/noThenProperty: a resource is awaitable
			then: (f, r) => (result ?? Promise.resolve(1)).then(f, r),
		}) as Resource<number>;
	const failed = (error: unknown): ResourceState<number> => ({
		status: 'error',
		data: undefined,
		error,
		isFetching: false,
		placeholder: false,
	});

	test('an error carrying data keeps it, a state is mapped once per source state', () => {
		const e = new GraphQLError('X', [{ message: 'm' }], 7, {
			retryable: false,
		});
		const r = graphqlResource(inner(failed(e)));
		expect(r.state.data).toBe(7);
		expect(r.state).toBe(r.state);
		const seen: unknown[] = [];
		r.subscribe((s) => seen.push(s.data));
		expect(seen).toEqual([7]);
	});

	test('other errors and states pass through untouched', () => {
		const plain = failed(new Error('x'));
		expect(graphqlResource(inner(plain)).state).toBe(plain);
		const nullData = failed(
			new GraphQLError('X', [], null, { retryable: false }),
		);
		expect(graphqlResource(inner(nullData)).state).toBe(nullData);
	});

	test('a signal that aborts rejects the wait, an aborted one at once', async () => {
		const ctl = new AbortController();
		const r = graphqlResource(
			inner(failed(1), new Promise(() => {})),
			ctl.signal,
		);
		const p = Promise.resolve(r);
		ctl.abort();
		await expect(p).rejects.toBeInstanceOf(RivaAbortError);
		await expect(
			Promise.resolve(graphqlResource(inner(failed(1)), ctl.signal)),
		).rejects.toBeInstanceOf(RivaAbortError);
		expect(await graphqlResource(inner(failed(1)))).toBe(1);
	});

	test('the abort listener is removed once the wait settles', async () => {
		const ctl = new AbortController();
		let added = 0;
		let removed = 0;
		const sig = ctl.signal;
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
		expect(await graphqlResource(inner(failed(1)), sig)).toBe(1);
		await expect(
			Promise.resolve(
				graphqlResource(inner(failed(1), Promise.reject(new Error('x'))), sig),
			),
		).rejects.toThrow('x');
		expect([added, removed]).toEqual([2, 2]);
	});
});
