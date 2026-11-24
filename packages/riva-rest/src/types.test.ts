import { expectTypeOf, test } from 'bun:test';
import type { Mutation, Query } from '@softistx/riva';
import { type Invoice, operations } from '../test/fixtures';
import { mutation, query } from './query';

const spec = { operations };

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
	// @ts-expect-error a path method the spec has no operation for
	query(spec, 'delete /invoices/{id}');
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
