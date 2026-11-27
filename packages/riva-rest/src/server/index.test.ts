import { expect, expectTypeOf, test } from 'bun:test';
import { createRiva, RivaScopeError } from '@softistx/riva';
import { operations as table } from '../../test/fixtures';
import { provideRest, type Route } from '../transport';
import {
	type DataOperation,
	type DataSource,
	type OperationsOf,
	operations,
} from './index';

function setup() {
	const seen: Array<{ route: Route; input: unknown; signal: AbortSignal }> = [];
	const riva = createRiva();
	provideRest(riva, {
		async call(route, input, { signal }) {
			seen.push({ route, input, signal });
			return { echoed: input };
		},
	});
	return { seen, riva, source: operations({ operations: table }) };
}

test('finds an operation by rest:<operationId> and runs it through the riva transport', async () => {
	const { seen, riva, source } = setup();
	const op = source.find('rest:getInvoice');
	expect(op?.kind).toBe('query');
	const signal = new AbortController().signal;
	const input = { param: { id: '7' } };
	expect(await op?.run(riva, input, signal)).toEqual({ echoed: input });
	expect(seen[0]?.route).toEqual({
		method: 'get',
		path: '/invoices/{id}',
		operationId: 'getInvoice',
		hasInput: true,
	});
	expect(seen[0]?.signal).toBe(signal);
});

test('reads are queries, other methods mutations; hasInput follows the spec', () => {
	const { source } = setup();
	expect(source.find('rest:listInvoices')?.kind).toBe('query');
	expect(source.find('rest:createInvoice')?.kind).toBe('mutation');
	expect(source.find('rest:deleteInvoice')?.kind).toBe('mutation');
	expect(source.find('rest:getInvoice')).toBe(source.find('rest:getInvoice'));
});

test('an operation with no input is called with none', async () => {
	const { seen, riva, source } = setup();
	await source
		.find('rest:health')
		?.run(riva, undefined, new AbortController().signal);
	expect(seen[0]?.route.hasInput).toBe(false);
});

test('an unknown id is not found: no prefix, unknown operation, inherited names', () => {
	const { source } = setup();
	for (const id of [
		'getInvoice',
		'rest:nope',
		'rest:',
		'rest:__proto__',
		'rest:toString',
		'graphql:getInvoice',
		'get /invoices/{id}',
	])
		expect(source.find(id)).toBeUndefined();
});

test('running on a riva with no REST transport throws RivaScopeError', async () => {
	const { source } = setup();
	await expect(
		source
			.find('rest:health')
			?.run(createRiva(), undefined, new AbortController().signal),
	).rejects.toBeInstanceOf(RivaScopeError);
});

test('types: operations() is a DataSource', () => {
	expectTypeOf(operations).returns.toEqualTypeOf<DataSource>();
	expectTypeOf<Parameters<typeof operations>[0]>().toEqualTypeOf<
		OperationsOf | object
	>();
	expectTypeOf<DataSource['find']>().returns.toEqualTypeOf<
		DataOperation | undefined
	>();
});

test('the bare operations table is read like a client', () => {
	const source = operations(table);
	expect(source.find('rest:getInvoice')?.kind).toBe('query');
	expect(source.find('rest:createInvoice')?.kind).toBe('mutation');
	expect(source.find('rest:nope')).toBeUndefined();
});
