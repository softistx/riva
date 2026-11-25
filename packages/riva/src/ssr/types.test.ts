import { expectTypeOf, test } from 'bun:test';
import type { RivaClient } from '../index';
import { dehydrate, hydrate, type Snapshot } from './index';

test('dehydrate returns a Snapshot, hydrate takes one', () => {
	expectTypeOf(dehydrate).toEqualTypeOf<(client: RivaClient) => Snapshot>();
	expectTypeOf<Parameters<typeof hydrate>[1]>().toEqualTypeOf<Snapshot>();
	expectTypeOf(hydrate).returns.toEqualTypeOf<Snapshot | undefined>();
});

test('hydrate rejects what dehydrate did not make', () => {
	const client = null as unknown as RivaClient;
	const never = () => {
		// @ts-expect-error not a snapshot
		hydrate(client, {});
		// @ts-expect-error a version that is not 1
		hydrate(client, { v: 2, t: 0, q: [], a: {} });
	};
	expectTypeOf(never).toBeFunction();
});

test('a snapshot is JSON-safe', () => {
	expectTypeOf<Snapshot['v']>().toEqualTypeOf<1>();
	expectTypeOf<Snapshot['t']>().toBeNumber();
});
