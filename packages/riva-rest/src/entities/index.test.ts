/* biome-ignore-all lint/style/useNamingConvention: type names and __typename */
import { expect, expectTypeOf, test } from 'bun:test';
import { createRiva, mutation, query } from '@softistx/riva';
import { entities, evict, readEntity } from '@softistx/riva/entities';
import { type RestEntities, restEntities } from './index';

type Invoice = { id: string; number: string; total: number };
const types = {
	Invoice: {
		is: (o: Record<string, unknown>) => 'number' in o,
		key: (o: Record<string, unknown>) => o['id'] as string,
	},
};

const setup = () => {
	const db: Record<string, Invoice> = {
		'1': { id: '1', number: 'F-1', total: 10 },
	};
	const cache = restEntities(types);
	const one = query({
		id: 'one',
		cache,
		fetch: async (v: { id: string }) => ({ data: db[v.id] }),
	});
	const all = query({
		id: 'all',
		cache,
		fetch: async () => ({ items: Object.values(db) }),
	});
	return { db, cache, one, all, riva: createRiva() };
};

test('REST responses are keyed by request and their invoices shared as entities', async () => {
	const { db, one, all, riva } = setup();
	await one.ensure(riva, { id: '1' });
	await all.ensure(riva);
	expect(readEntity(riva, 'Invoice:1')).toMatchObject({ total: 10 });
	db['1'] = { id: '1', number: 'F-1', total: 99 };
	await one.ensure(riva, { id: '1' }); // stale: staleTime 0 refetches
	const list = riva.get(all).data as { items: Invoice[] };
	expect(list.items[0]?.total).toBe(99);
});

test('what no type recognises stays plain, and the input is not mutated', async () => {
	const { cache, riva } = setup();
	const raw = {
		meta: { page: 1 },
		items: [{ id: '1', number: 'F', total: 1 }],
	};
	const q = query({ id: 'q', cache, fetch: async () => raw });
	const data = (await q.ensure(riva)) as typeof raw & {
		items: { __typename?: string }[];
	};
	expect(data.meta).toEqual({ page: 1 });
	expect(data.items[0]?.__typename).toBe('Invoice');
	expect(Object.hasOwn(raw.items[0] as object, '__typename')).toBe(false);
});

test('a mutation result updates every query showing the invoice', async () => {
	const { cache, one, all, riva } = setup();
	await one.ensure(riva, { id: '1' });
	await all.ensure(riva);
	const rename = mutation({
		id: 'rename',
		cache,
		mutate: async () => ({ id: '1', number: 'F-1', total: 5 }),
	});
	await rename.mutate(riva);
	const list = riva.get(all).data as { items: Invoice[] };
	expect(list.items[0]?.total).toBe(5);
	evict(riva, 'Invoice:1');
});

test('an object with its own __typename keeps it', async () => {
	const { cache, riva } = setup();
	const q = query({
		id: 'typed',
		cache,
		fetch: async () => ({
			id: '3',
			number: 'x',
			total: 1,
			__typename: 'Credit',
		}),
	});
	const data = (await q.ensure(riva)) as unknown as { __typename: string };
	expect(data.__typename).toBe('Credit');
});

const tagged = async (
	cache: ReturnType<typeof restEntities>,
	data: unknown,
) => {
	const riva = createRiva();
	return (await query({ id: 'x', cache, fetch: async () => data }).ensure(
		riva,
	)) as never as Record<string, unknown>;
};

test('a key function alone tags and normalises like the full form', async () => {
	const cache = restEntities({ Invoice: (o) => o['id'] as string });
	const riva = createRiva();
	const q = query({
		id: 'q',
		cache,
		fetch: async () => ({ id: '1', number: 'F-1', total: 3 }),
	});
	const data = (await q.ensure(riva)) as unknown as { __typename: string };
	expect(data.__typename).toBe('Invoice');
	expect(readEntity(riva, 'Invoice:1')).toMatchObject({ total: 3 });
});

test('an object whose key is undefined stays plain', async () => {
	const cache = restEntities({
		Invoice: (o) => ('number' in o ? (o['id'] as string) : undefined),
	});
	const data = await tagged(cache, { id: '1', name: 'x' });
	expect(Object.hasOwn(data, '__typename')).toBe(false);
});

test('two discriminating shorthands tag each object with its own type', async () => {
	const cache = restEntities({
		Invoice: (o) => ('number' in o ? (o['id'] as string) : undefined),
		Customer: (o) => ('email' in o ? (o['id'] as string) : undefined),
	});
	const data = (await tagged(cache, {
		invoice: { id: '1', number: 'F' },
		customer: { id: '2', email: 'a@b.c' },
	})) as Record<string, { __typename: string }>;
	expect(data['invoice']?.__typename).toBe('Invoice');
	expect(data['customer']?.__typename).toBe('Customer');
});

test('the shorthand and the full form mix in one policy', async () => {
	const cache = restEntities({
		Invoice: types.Invoice,
		Customer: (o) => ('email' in o ? (o['id'] as string) : undefined),
	});
	const data = (await tagged(cache, {
		invoice: { id: '1', number: 'F' },
		customer: { id: '2', email: 'a@b.c' },
	})) as Record<string, { __typename: string }>;
	expect(data['invoice']?.__typename).toBe('Invoice');
	expect(data['customer']?.__typename).toBe('Customer');
});

test('declaration order wins when shorthands overlap', async () => {
	const cache = restEntities({
		First: (o) => o['id'] as string,
		Second: (o) => o['id'] as string,
	});
	const data = (await tagged(cache, { id: '1' })) as { __typename: string };
	expect(data.__typename).toBe('First');
});

test('RestEntities accepts both forms and rejects anything else', () => {
	expectTypeOf<{
		A: (o: Record<string, unknown>) => string;
	}>().toExtend<RestEntities>();
	expectTypeOf<{ A: typeof types.Invoice }>().toExtend<RestEntities>();
	// @ts-expect-error a type is a key function or an { is, key } object
	const bad: RestEntities = { A: 'id' };
	expect(bad).toBeDefined();
});

test('a REST policy and a core entities() policy with other types share one store', async () => {
	const riva = createRiva();
	const rest = query({
		id: 'rest',
		cache: restEntities(types),
		fetch: async () => ({ id: '1', number: 'F-1', total: 10 }),
	});
	// stands in for riva-graphql's normalized(), which passes its keys to entities()
	const other = query({
		id: 'other',
		cache: entities({ keys: { Patient: (o) => o['mrn'] as string } }),
		fetch: async () => ({ __typename: 'Patient', mrn: '7', name: 'Ada' }),
	});
	await rest.ensure(riva);
	await other.ensure(riva);
	expect(readEntity(riva, 'Invoice:1')).toMatchObject({ number: 'F-1' });
	expect(readEntity(riva, 'Patient:7')).toMatchObject({ name: 'Ada' });
});
