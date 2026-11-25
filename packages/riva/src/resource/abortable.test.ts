import { describe, expect, test } from 'bun:test';
import { RivaAbortError } from '../errors';
import { abortable } from './abortable';

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
