import { expect, expectTypeOf, test } from 'bun:test';
import { computed, signal } from '@softistx/riva';
import type { InputArg } from './resources';

test('InputArg is a value, a signal, a computed or a function', () => {
	expectTypeOf<{ a: number }>().toExtend<InputArg<{ a: number }>>();
	expectTypeOf(signal({ a: 1 })).toExtend<InputArg<{ a: number }>>();
	expectTypeOf(computed(() => ({ a: 1 }))).toExtend<InputArg<{ a: number }>>();
	expectTypeOf<() => { a: number }>().toExtend<InputArg<{ a: number }>>();
	expect(true).toBe(true);
});
