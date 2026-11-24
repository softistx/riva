import { expectTypeOf, test } from 'bun:test';
import type { CachePolicy, RivaClient } from '../index';
import { type EntityPolicy, entities } from './index';

test('entities() is a cache policy with an identity', () => {
	const policy = entities({
		// biome-ignore lint/style/useNamingConvention: a type name
		keys: { Book: (b) => String(b['isbn']) },
		identify: (o) => (o['sku'] ? `Item:${o['sku']}` : undefined),
	});
	expectTypeOf(policy).toEqualTypeOf<EntityPolicy>();
	expectTypeOf(policy.identify).returns.toEqualTypeOf<string | undefined>();
	expectTypeOf(entities()).toExtend<CachePolicy>();
});

test('CachePolicy methods take the client', () => {
	expectTypeOf<CachePolicy<number>['write']>().parameters.toEqualTypeOf<
		[RivaClient, unknown]
	>();
	expectTypeOf<CachePolicy<number>['write']>().returns.toBeNumber();
	expectTypeOf<CachePolicy<number>['read']>().parameters.toEqualTypeOf<
		[RivaClient, number]
	>();
	expectTypeOf<CachePolicy<number>['release']>().returns.toBeVoid();
});
