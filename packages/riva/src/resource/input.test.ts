import { describe, expect, expectTypeOf, test } from 'bun:test';
import { createRiva } from '../client';
import { computed } from '../computed';
import { signal } from '../signal';
import { isReactive, type TrackedInput, trackedInput } from './input';

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
