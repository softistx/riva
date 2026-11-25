import { expectTypeOf, test } from 'bun:test';
import type { Riva } from '../index';
import { dehydrate, hydrate, type Snapshot } from './index';

test('dehydrate returns a Snapshot, hydrate takes one', () => {
	expectTypeOf(dehydrate).toEqualTypeOf<(riva: Riva) => Snapshot>();
	expectTypeOf<Parameters<typeof hydrate>[1]>().toEqualTypeOf<Snapshot>();
	expectTypeOf(hydrate).returns.toEqualTypeOf<Snapshot | undefined>();
});

test('hydrate rejects what dehydrate did not make', () => {
	const riva = null as unknown as Riva;
	const never = () => {
		// @ts-expect-error not a snapshot
		hydrate(riva, {});
		// @ts-expect-error a version that is not 1
		hydrate(riva, { v: 2, t: 0, q: [], a: {} });
	};
	expectTypeOf(never).toBeFunction();
});

test('a snapshot is JSON-safe', () => {
	expectTypeOf<Snapshot['v']>().toEqualTypeOf<1>();
	expectTypeOf<Snapshot['t']>().toBeNumber();
});

test('a hand-made literal is not a Snapshot', () => {
	const never = () => {
		// @ts-expect-error the brand is missing
		const s: Snapshot = { v: 1, t: 0, q: [], a: {} };
		return s;
	};
	expectTypeOf(never).toBeFunction();
});
