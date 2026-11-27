import { describe, expect, expectTypeOf, test } from 'bun:test';
import type { Observable } from 'rxjs';
import { createRiva } from '../client';
import { computed } from '../computed';
import { type Query, type QueryState, query } from '../query';
import { mutationHandle } from '../resource/mutation-handle';
import type { MutationState } from '../resource/types';
import { signal } from '../signal';
import { data$, toObservable } from './to-observable';

const tick = () => new Promise<void>((r) => setImmediate(r));

describe('toObservable', () => {
	test('a signal emits its value, then each change, and stops on unsubscribe', () => {
		const riva = createRiva();
		const n = signal(1);
		const seen: number[] = [];
		const sub = toObservable(riva, n).subscribe((v) => seen.push(v));
		riva.set(n, 2);
		sub.unsubscribe();
		riva.set(n, 3);
		expect(seen).toEqual([1, 2]);
	});

	test('a computed emits derived values', () => {
		const riva = createRiva();
		const n = signal(1);
		const twice = computed((get) => get(n) * 2);
		const seen: number[] = [];
		toObservable(riva, twice).subscribe((v) => seen.push(v));
		riva.set(n, 5);
		expect(seen).toEqual([2, 10]);
	});

	test('it is cold: nothing is fetched before the subscription', async () => {
		const riva = createRiva();
		let calls = 0;
		const q = query({
			id: 'cold',
			fetch: async () => {
				calls++;
				return 1;
			},
		});
		const o = toObservable(riva, q);
		await tick();
		expect(calls).toBe(0);
		const sub = o.subscribe();
		await tick();
		expect(calls).toBe(1);
		sub.unsubscribe();
	});

	test('a query emits its full states, loading to success', async () => {
		const riva = createRiva();
		const q = query({ id: 'one', fetch: async (n: number) => n * 2 });
		const seen: Array<[string, unknown]> = [];
		const sub = toObservable(riva, q, 21).subscribe((s) =>
			seen.push([s.status, s.data]),
		);
		await tick();
		sub.unsubscribe();
		expect(seen[0]?.[0]).toBe('loading');
		expect(seen.at(-1)).toEqual(['success', 42]);
		expect(seen.map((s) => s[0])).toContain('loading');
	});

	test('an error is a value: the stream goes on, a refetch can recover', async () => {
		const riva = createRiva();
		let fail = true;
		const q = query({
			id: 'err',
			retry: 0,
			fetch: async () => {
				if (fail) throw new Error('boom');
				return 'ok';
			},
		});
		const seen: QueryState<string>[] = [];
		let ended = false;
		const sub = toObservable(riva, q).subscribe({
			next: (s) => seen.push(s),
			error: () => {
				ended = true;
			},
			complete: () => {
				ended = true;
			},
		});
		await tick();
		expect(seen.at(-1)?.status).toBe('error');
		expect(String(seen.at(-1)?.error)).toBe('Error: boom');
		fail = false;
		q.invalidate(riva);
		await tick();
		expect(seen.at(-1)).toMatchObject({ status: 'success', data: 'ok' });
		expect(ended).toBe(false);
		sub.unsubscribe();
	});

	test('unsubscribing releases the query, a second subscriber keeps it', async () => {
		const riva = createRiva();
		let calls = 0;
		const q = query({
			id: 'shared',
			fetch: async () => ++calls,
		});
		const a = toObservable(riva, q).subscribe();
		const b = toObservable(riva, q).subscribe();
		await tick();
		expect(calls).toBe(1);
		a.unsubscribe();
		b.unsubscribe();
	});

	test('a mutation handle emits its state', async () => {
		const riva = createRiva();
		const save = mutationHandle<number, string>(riva, async (n) => `#${n}`);
		const seen: string[] = [];
		const sub = toObservable(riva, save).subscribe((s) => seen.push(s.status));
		await save(1);
		sub.unsubscribe();
		expect(seen).toEqual(['idle', 'loading', 'success']);
	});

	test('a mutation handle that fails emits error and does not end', async () => {
		const riva = createRiva();
		const save = mutationHandle<void, string>(riva, async () => {
			throw new Error('no');
		});
		const seen: string[] = [];
		let ended = false;
		toObservable(riva, save).subscribe({
			next: (s) => seen.push(s.status),
			error: () => {
				ended = true;
			},
		});
		await save().catch(() => {});
		expect(seen).toEqual(['idle', 'loading', 'error']);
		expect(ended).toBe(false);
	});

	test('an async iterable goes through the same helper', async () => {
		async function* gen() {
			yield 1;
			yield 2;
		}
		const seen: number[] = [];
		await new Promise<void>((done) =>
			toObservable(gen()).subscribe({
				next: (v) => seen.push(v),
				complete: done,
			}),
		);
		expect(seen).toEqual([1, 2]);
	});

	test('types', () => {
		const riva = createRiva();
		const q = query({ id: 't', fetch: async (n: number) => String(n) });
		const noVars = query({ id: 't2', fetch: async () => 1 });
		expectTypeOf(toObservable(riva, q, 1)).toEqualTypeOf<
			Observable<QueryState<string>>
		>();
		expectTypeOf(toObservable(riva, noVars)).toEqualTypeOf<
			Observable<QueryState<number>>
		>();
		// @ts-expect-error the variables are required
		toObservable(riva, q);
		expectTypeOf(toObservable(riva, signal('a'))).toEqualTypeOf<
			Observable<string>
		>();
		const h = mutationHandle<number, boolean>(riva, async () => true);
		expectTypeOf(toObservable(riva, h)).toEqualTypeOf<
			Observable<MutationState<boolean>>
		>();
		async function* g() {
			yield 'x';
		}
		expectTypeOf(toObservable(g())).toEqualTypeOf<Observable<string>>();
		expectTypeOf<typeof q>().toExtend<Query<number, string>>();
	});
});

describe('data$', () => {
	test('maps a query to its data, without repeats', async () => {
		const riva = createRiva();
		const q = query({ id: 'd', fetch: async () => 'v' });
		const seen: unknown[] = [];
		const sub = data$(riva, q).subscribe((d) => seen.push(d));
		await tick();
		sub.unsubscribe();
		expect(seen).toEqual([undefined, 'v']);
	});

	test('maps a mutation handle to its data', async () => {
		const riva = createRiva();
		const save = mutationHandle<void, number>(riva, async () => 7);
		const seen: unknown[] = [];
		data$(riva, save).subscribe((d) => seen.push(d));
		await save();
		expect(seen).toEqual([undefined, 7]);
	});

	test('types', () => {
		const riva = createRiva();
		const q = query({ id: 'dt', fetch: async () => 1 });
		expectTypeOf(data$(riva, q)).toEqualTypeOf<
			Observable<number | undefined>
		>();
		const h = mutationHandle<void, string>(riva, async () => 'a');
		expectTypeOf(data$(riva, h)).toExtend<Observable<unknown>>();
	});
});
