import { describe, expect, test } from 'bun:test';
import { makeIdentify } from './identity';

describe('makeIdentify (ported from graphql-client identity.spec)', () => {
	const identify = makeIdentify();

	test('__typename and id, else _id', () => {
		expect(identify({ __typename: 'Book', id: '1' })).toBe('Book:1');
		expect(identify({ __typename: 'Book', id: 7 })).toBe('Book:7');
		expect(identify({ __typename: 'Book', _id: 'a' })).toBe('Book:a');
	});

	test('no __typename, or no scalar id, is no identity', () => {
		expect(identify({ id: '1' })).toBeUndefined();
		expect(identify({ __typename: 'Price', amount: 1 })).toBeUndefined();
		expect(identify({ __typename: 'Book', id: { nested: 1 } })).toBeUndefined();
		expect(identify({ __typename: 3, id: 1 })).toBeUndefined();
	});

	test('keys gives a type its identity, or none with undefined', () => {
		const keyed = makeIdentify({
			keys: {
				// biome-ignore lint/style/useNamingConvention: a type name
				Book: (b) => String(b['isbn']),
				// biome-ignore lint/style/useNamingConvention: a type name
				Session: () => undefined,
			},
		});
		expect(keyed({ __typename: 'Book', id: '1', isbn: 'x' })).toBe('Book:x');
		expect(keyed({ __typename: 'Session', id: '1' })).toBeUndefined();
		expect(keyed({ __typename: 'Author', id: '1' })).toBe('Author:1');
	});

	test('a typename named like an Object.prototype key is not a keys entry', () => {
		const keyed = makeIdentify({ keys: {} });
		expect(keyed({ __typename: 'constructor', id: '1' })).toBe('constructor:1');
	});

	test('a custom identify replaces the default', () => {
		const custom = makeIdentify({
			identify: (o) =>
				typeof o['sku'] === 'string' ? `Item:${o['sku']}` : undefined,
		});
		expect(custom({ sku: 'a' })).toBe('Item:a');
		expect(custom({ __typename: 'Book', id: '1' })).toBeUndefined();
	});
});
