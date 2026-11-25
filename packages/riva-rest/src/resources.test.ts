import { expect, test } from 'bun:test';
import { computed, createRiva, RivaAbortError, signal } from '@softistx/riva';
import { abortable, inputReader } from './resources';

const riva = createRiva();

test('inputReader reads a value, a signal, a computed and a function', () => {
	const s = signal({ a: 1 });
	const c = computed(() => ({ a: riva.get(s).a + 1 }));
	expect(inputReader(riva, { a: 0 })()).toEqual({ a: 0 });
	expect(inputReader(riva, s)()).toEqual({ a: 1 });
	expect(inputReader(riva, c)()).toEqual({ a: 2 });
	expect(inputReader(riva, () => ({ a: 3 }))()).toEqual({ a: 3 });
	expect(inputReader(riva, undefined)()).toBeUndefined();
	expect(inputReader(riva, null)()).toBeNull();
});

test('abortable rejects a pending await with RivaAbortError and passes a result through', async () => {
	const inner = {
		state: { status: 'loading' },
		subscribe: () => () => {},
		// biome-ignore lint/suspicious/noThenProperty: a resource is awaitable on purpose
		then: (f: (d: number) => unknown) => Promise.resolve(1).then(f),
	} as never;
	expect(abortable(inner)).toBe(inner);
	const ok = abortable(inner, new AbortController().signal);
	expect(await ok).toBe(1);
	const c = new AbortController();
	c.abort();
	await expect(
		Promise.resolve(abortable(inner, c.signal)),
	).rejects.toBeInstanceOf(RivaAbortError);
});
