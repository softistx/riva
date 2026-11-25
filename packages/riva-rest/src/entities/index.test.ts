/* biome-ignore-all lint/style/useNamingConvention: type names and __typename */
import { expect, test } from 'bun:test';
import { createRiva, mutation, query } from '@softistx/riva';
import { evict, readEntity } from '@softistx/riva/entities';
import { restEntities } from './index';

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
		run: async () => ({ id: '1', number: 'F-1', total: 5 }),
	});
	await rename.run(riva);
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
	const data = (await q.ensure(riva)) as { __typename: string };
	expect(data.__typename).toBe('Credit');
});
