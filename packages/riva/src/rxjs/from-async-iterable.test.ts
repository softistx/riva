import { expect, expectTypeOf, test } from 'bun:test';
import type { Observable } from 'rxjs';
import { fromAsyncIterable } from './from-async-iterable';

const tick = () => new Promise<void>((r) => setImmediate(r));

test('values, then complete', async () => {
	async function* g() {
		yield 'a';
		yield 'b';
	}
	const seen: string[] = [];
	let done = false;
	fromAsyncIterable(g()).subscribe({
		next: (v) => seen.push(v),
		complete: () => {
			done = true;
		},
	});
	await tick();
	expect(seen).toEqual(['a', 'b']);
	expect(done).toBe(true);
});

test('a failure is an error notification', async () => {
	async function* g() {
		yield 1;
		throw new Error('bad');
	}
	let err: unknown;
	fromAsyncIterable(g()).subscribe({ error: (e) => (err = e) });
	await tick();
	expect((err as Error).message).toBe('bad');
});

test('unsubscribing calls return() and stops the values', async () => {
	let returned = 0;
	let release: (() => void) | undefined;
	const it: AsyncIterable<number> = {
		[Symbol.asyncIterator]: () => ({
			next: () =>
				new Promise<IteratorResult<number>>((r) => {
					release = () => r({ done: false, value: 1 });
				}),
			return: async () => {
				returned++;
				return { done: true, value: undefined };
			},
		}),
	};
	const seen: number[] = [];
	const sub = fromAsyncIterable(it).subscribe((v) => seen.push(v));
	await tick();
	sub.unsubscribe();
	release?.();
	await tick();
	expect(returned).toBe(1);
	expect(seen).toEqual([]);
});

test('a factory gets a signal aborted on unsubscribe', async () => {
	let signal: AbortSignal | undefined;
	async function* g() {
		yield 1;
		await new Promise(() => {});
	}
	const sub = fromAsyncIterable((s) => {
		signal = s;
		return g();
	}).subscribe();
	await tick();
	expect(signal?.aborted).toBe(false);
	sub.unsubscribe();
	expect(signal?.aborted).toBe(true);
});

test('each subscription opens its own iterator (cold)', async () => {
	let opened = 0;
	const o = fromAsyncIterable(() => {
		opened++;
		return (async function* () {})();
	});
	expect(opened).toBe(0);
	o.subscribe();
	o.subscribe();
	expect(opened).toBe(2);
});

test('types', () => {
	async function* g() {
		yield 1;
	}
	expectTypeOf(fromAsyncIterable(g())).toEqualTypeOf<Observable<number>>();
});
