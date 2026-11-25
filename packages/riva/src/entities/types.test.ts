import { expectTypeOf, test } from 'bun:test';
import type { CachePolicy, Riva } from '../index';
import {
	type EntityCodec,
	type EntityPolicy,
	type EntityReader,
	entities,
} from './index';

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

test('CachePolicy methods take the riva', () => {
	expectTypeOf<CachePolicy<number>['write']>().parameters.toEqualTypeOf<
		[Riva, unknown, (number | undefined)?, unknown?]
	>();
	expectTypeOf<CachePolicy<number>['write']>().returns.toBeNumber();
	expectTypeOf<CachePolicy<number>['read']>().parameters.toEqualTypeOf<
		[Riva, number, (boolean | undefined)?]
	>();
	expectTypeOf<CachePolicy<number>['release']>().returns.toBeVoid();
});

test('entities(opts, codec) takes a codec over a narrow reader', () => {
	const codec: EntityCodec = {
		normalize: (store, data) => ({
			root: data,
			pending: new Map([[store.identify({}) ?? 'x', {}]]),
		}),
		denormalize: (store, root) => store.fields('A:1') ?? root,
	};
	expectTypeOf(entities(undefined, codec)).toEqualTypeOf<EntityPolicy>();
	// @ts-expect-error a codec's reader has no `merge`
	(store: EntityReader) => store.merge;
});
