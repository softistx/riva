import { expectTypeOf, test } from 'bun:test';
import {
	type Computed,
	computed,
	createRivaClient,
	type Signal,
	signal,
} from './index';

test('types', () => {
	const a = signal(0);
	const flag = computed((get) => get(a) > 0);
	const c = createRivaClient();
	expectTypeOf(a).toEqualTypeOf<Signal<number>>();
	expectTypeOf(flag).toEqualTypeOf<Computed<boolean>>();
	expectTypeOf(c.get(a)).toEqualTypeOf<number>();
	expectTypeOf(c.get(flag)).toEqualTypeOf<boolean>();
	expectTypeOf(signal('')).toEqualTypeOf<Signal<string>>();
	c.set(a, 1);
	c.set(a, (p) => p + 1);
	// @ts-expect-error wrong value type
	c.set(a, 'x');
	// @ts-expect-error a computed is not writable
	c.set(flag, true);
});
