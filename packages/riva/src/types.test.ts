import { expectTypeOf, test } from 'bun:test';
import {
	type Atom,
	atom,
	type Computed,
	computed,
	createRivaClient,
} from './index';

test('types', () => {
	const a = atom(0);
	const flag = computed((get) => get(a) > 0);
	const c = createRivaClient();
	expectTypeOf(a).toEqualTypeOf<Atom<number>>();
	expectTypeOf(flag).toEqualTypeOf<Computed<boolean>>();
	expectTypeOf(c.get(a)).toEqualTypeOf<number>();
	expectTypeOf(c.get(flag)).toEqualTypeOf<boolean>();
	expectTypeOf(atom('')).toEqualTypeOf<Atom<string>>();
	c.set(a, 1);
	c.set(a, (p) => p + 1);
	// @ts-expect-error wrong value type
	c.set(a, 'x');
	// @ts-expect-error a computed is not writable
	c.set(flag, true);
});
