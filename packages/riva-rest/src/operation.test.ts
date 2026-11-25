import { expect, test } from 'bun:test';
import { RivaError } from '@softistx/riva';
import { operations } from '../test/fixtures';
import { operationOf } from './operation';

const spec = { operations };
const of = (route: string, kind: 'query' | 'mutation' = 'query') =>
	operationOf(spec, route as never, kind);

test('reads a route into its id, method and path', () => {
	expect(of('get /invoices/{id}')).toEqual({
		id: 'get /invoices/{id}',
		method: 'get',
		path: '/invoices/{id}',
		operationId: 'getInvoice',
		hasInput: true,
	});
	expect(of('get /health').hasInput).toBe(false);
	expect(of('post /invoices', 'mutation').method).toBe('post');
});

test('refuses a route that is not a string', () => {
	expect(() => of(undefined as never)).toThrow('is not a route');
	expect(() => of(42 as never)).toThrow('is not a route');
});

test('refuses what is not a route', () => {
	expect(() => of('invoices')).toThrow('is not a route');
	expect(() => of('get invoices')).toThrow('is not a route');
});

test('refuses a route the spec has no operation for', () => {
	expect(() => of('get /nope')).toThrow(
		'riva-rest: the OpenAPI client has no operation at GET /nope',
	);
	expect(() => operationOf({} as never, 'get /x' as never, 'query')).toThrow(
		RivaError,
	);
});

test('refuses a mutation on a read and a query on a write', () => {
	expect(() => of('get /health', 'mutation')).toThrow('define it with query()');
	const w = {
		operations: {
			a: { method: 'delete', path: '/a' },
		},
	};
	expect(() => operationOf(w as never, 'delete /a' as never, 'query')).toThrow(
		'define it with mutation()',
	);
});

test('a POST can be a query (a search)', () => {
	const s = { operations: { a: { method: 'post', path: '/search' } } };
	expect(operationOf(s as never, 'post /search' as never, 'query').id).toBe(
		'post /search',
	);
});
