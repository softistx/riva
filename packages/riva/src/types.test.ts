import { expectTypeOf, test } from 'bun:test';
import {
	type Computed,
	computed,
	createRiva,
	type Riva,
	type RivaExtension,
	type Signal,
	signal,
} from './index';

test('types', () => {
	const a = signal(0);
	const flag = computed((get) => get(a) > 0);
	const c = createRiva();
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

test('extensions are typed on the instance', () => {
	const ext: RivaExtension<{ query(n: number): string }> = {
		install: () => ({ query: (n) => String(n) }),
	};
	const riva = createRiva({ graphql: ext, defaults: { staleTime: '5s' } });
	expectTypeOf(riva.graphql).toEqualTypeOf<{ query(n: number): string }>();
	expectTypeOf(riva.graphql.query(1)).toEqualTypeOf<string>();
	expectTypeOf(riva.get).toEqualTypeOf<Riva['get']>();
	expectTypeOf(createRiva()).toEqualTypeOf<Riva>();
	// A key that is not an extension adds nothing.
	const plain = createRiva({ note: { text: 'x' } });
	expectTypeOf(plain).not.toHaveProperty('note');
	// biome-ignore lint/suspicious/noExplicitAny: any-typed extension
	const any = createRiva({ x: {} as RivaExtension<any> });
	expectTypeOf(any.x).toBeAny();
	// A Riva member name cannot be an extension.
	// Never called: these only have to fail to type-check.
	() => {
		// @ts-expect-error `get` is a Riva member
		createRiva({ get: ext });
		// @ts-expect-error `defaults` is not an extension
		createRiva({ defaults: ext });
	};
});
