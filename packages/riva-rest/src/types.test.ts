import { expectTypeOf, test } from 'bun:test';
import {
	createOpenApiClient,
	type OperationTable,
} from '@softistx/openapi-httpyz';
import type { Mutation, Query } from '@softistx/riva';
import { apiOver, httpWith, type Invoice, operations } from '../test/fixtures';
import { mutation, query } from './query';

const http = httpWith(() => new Response());
// decode: false, as the fixtures build it: data as JSON carries it.
const spec = apiOver(http);
// decode: true (the default): data as the spec decodes it.
const decoded = createOpenApiClient(http, operations);

// One operation whose decoded reply differs from the JSON one.
type Reply<D> = { status: 200; type: string | undefined; data: D };
interface DatedOperations {
	getEvent: {
		method: 'get';
		path: '/events';
		args: [];
		reply: Reply<{ at: Date }>;
		wire: Reply<{ at: string }>;
	};
}
const dated = operations as unknown as OperationTable<DatedOperations>;

// Type tests only: nothing here runs.
const types = () => {
	const invoice = query(spec, 'get /invoices/{id}');
	expectTypeOf(invoice).toEqualTypeOf<
		Query<{ param: { id: string } }, Invoice>
	>();
	const list = query(spec, 'get /invoices');
	expectTypeOf(list).toEqualTypeOf<
		Query<{ query?: { page?: number } } | undefined, { items: Invoice[] }>
	>();
	const health = query(spec, 'get /health');
	expectTypeOf(health).toEqualTypeOf<Query<void, { ok: boolean }>>();
	const create = mutation(spec, 'post /invoices', {
		updates: (_tx, data, vars) => {
			expectTypeOf(data).toEqualTypeOf<Invoice>();
			expectTypeOf(vars.json.total).toBeNumber();
		},
	});
	expectTypeOf(create).toEqualTypeOf<
		Mutation<{ json: { number: string; total: number } }, Invoice>
	>();
	// @ts-expect-error a route the spec does not have
	query(spec, 'get /nope');
	// @ts-expect-error a delete is a mutation
	query(spec, 'delete /invoices/{id}');
	// @ts-expect-error a get is a query
	mutation(spec, 'get /invoices');
	// @ts-expect-error a path method the spec has no operation for
	query(spec, 'patch /invoices/{id}');
	const remove = mutation(spec, 'delete /invoices/{id}');
	expectTypeOf(remove).toEqualTypeOf<
		Mutation<{ param: { id: string } }, undefined>
	>();
	const atDecoded = query(createOpenApiClient(http, dated), 'get /events');
	expectTypeOf(atDecoded).toEqualTypeOf<Query<void, { at: Date }>>();
	const atWire = query(
		createOpenApiClient(http, dated, { decode: false }),
		'get /events',
	);
	expectTypeOf(atWire).toEqualTypeOf<Query<void, { at: string }>>();
	const fromDecoded = query(decoded, 'get /invoices/{id}');
	expectTypeOf(fromDecoded).toEqualTypeOf<
		Query<{ param: { id: string } }, Invoice>
	>();
	const free = query({
		id: 'free',
		fetch: async (vars: { q: string }) => [vars.q],
	});
	expectTypeOf(free).toEqualTypeOf<Query<{ q: string }, string[]>>();
	const generic = query<{ id: string }, { name: string }>({
		id: 'generic',
		fetch: async (v) => ({ name: v.id }),
	});
	expectTypeOf(generic).toEqualTypeOf<
		Query<{ id: string }, { name: string }>
	>();
	const run = mutation({ id: 'run', run: async (n: number) => n });
	expectTypeOf(run).toEqualTypeOf<Mutation<number, number>>();
};
void types;

test('type tests compile', () => {});
