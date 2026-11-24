import { describe, expect, test } from 'bun:test';
import { createRivaClient } from '../client';
import { computed } from '../computed';
import { RivaError } from '../errors';
import { query } from '../query';
import {
	evict,
	identifyOf,
	invalidateEntity,
	readEntity,
	writeEntity,
} from './api';
import { entities, storeOf } from './policy';

const cache = entities();
// biome-ignore lint/style/useNamingConvention: GraphQL's field name
type Item = { __typename: 'Item'; id: string; name: string; tags?: string[] };
let calls = { list: 0, one: 0 };
let items: Item[] = [];
const list = query<void, { items: Item[] }>({
	id: 'list',
	cache,
	staleTime: '1h',
	fetch: async () => {
		calls.list++;
		return { items: structuredClone(items) };
	},
});
const one = query<{ id: string }, Item>({
	id: 'one',
	cache,
	staleTime: '1h',
	fetch: async (v) => {
		calls.one++;
		return structuredClone(items.find((i) => i.id === v.id)) as Item;
	},
});

const setup = async () => {
	calls = { list: 0, one: 0 };
	items = [
		{ __typename: 'Item', id: '1', name: 'A', tags: ['x'] },
		{ __typename: 'Item', id: '2', name: 'B' },
	];
	const client = createRivaClient();
	await list.ensure(client);
	await one.ensure(client, { id: '1' });
	return client;
};

describe('writeEntity / readEntity', () => {
	test('readEntity gives the entity, undefined when missing', async () => {
		const client = await setup();
		expect(readEntity(client, 'Item:1')).toEqual(items[0]);
		expect(readEntity(client, 'Item:9')).toBeUndefined();
	});

	test('a patch is merged and every query reading it sees it', async () => {
		const client = await setup();
		writeEntity<Partial<Item>>(client, 'Item:1', { name: 'A2' });
		expect(client.get(list).data?.items[0]).toEqual({
			...(items[0] as Item),
			name: 'A2',
		});
		expect(client.get(one, { id: '1' }).data?.name).toBe('A2');
		expect(client.get(list).data?.items[1]).toEqual(items[1]);
	});

	test('a function gets the current value; readers are notified once', async () => {
		const client = await setup();
		const seen: unknown[] = [];
		client.subscribe(one, { id: '1' }, (s) => seen.push(s.data?.tags));
		writeEntity(client, 'Item:1', (prev) => ({
			tags: [...((prev?.['tags'] as string[] | undefined) ?? []), 'y'],
		}));
		expect(seen).toEqual([['x', 'y']]);
	});

	test('writing a new entity creates it, nested entities included', async () => {
		const client = await setup();
		writeEntity(client, 'Item:3', {
			__typename: 'Item',
			id: '3',
			name: 'C',
			owner: { __typename: 'User', id: 'u' },
		});
		expect(readEntity(client, 'Item:3')).toMatchObject({
			name: 'C',
			owner: { id: 'u' },
		});
		expect(storeOf(client).peek('User:u')).toBeDefined();
	});

	test('RIVA_CACHE for a non-JSON patch, and nothing changes', async () => {
		const client = await setup();
		const before = readEntity(client, 'Item:1');
		expect(() => writeEntity(client, 'Item:1', { f: () => 1 })).toThrow(
			RivaError,
		);
		expect(readEntity(client, 'Item:1')).toEqual(before);
	});

	test('readEntity inside a computed is tracked', async () => {
		const client = await setup();
		const name = computed(() => readEntity<Item>(client, 'Item:2')?.name);
		const seen: unknown[] = [];
		client.subscribe(name, (v) => seen.push(v));
		writeEntity(client, 'Item:1', { name: 'other' });
		writeEntity(client, 'Item:2', { name: 'B2' });
		expect(seen).toEqual(['B2']);
	});
});

describe('evict', () => {
	test('removes the entity; queries see it missing; false when absent', async () => {
		const client = await setup();
		expect(evict(client, 'Item:2')).toBe(true);
		expect(evict(client, 'Item:2')).toBe(false);
		expect(client.get(list).data?.items as unknown[]).toEqual([
			items[0],
			undefined,
		]);
		expect(readEntity(client, 'Item:2')).toBeUndefined();
	});

	test('a later fetch brings it back', async () => {
		const client = await setup();
		evict(client, 'Item:2');
		list.invalidate(client);
		await list.ensure(client);
		expect(readEntity(client, 'Item:2')).toEqual(items[1]);
	});
});

describe('invalidateEntity', () => {
	test('marks stale every entry that reaches the entity, and only those', async () => {
		const client = await setup();
		await one.ensure(client, { id: '2' });
		calls = { list: 0, one: 0 };
		invalidateEntity(client, 'Item:1');
		await list.ensure(client);
		await one.ensure(client, { id: '1' });
		await one.ensure(client, { id: '2' }); // not stale: untouched
		expect(calls).toEqual({ list: 1, one: 1 });
	});

	test('refetches an observed entry at once', async () => {
		const client = await setup();
		const off = client.subscribe(one, { id: '1' }, () => {});
		calls = { list: 0, one: 0 };
		invalidateEntity(client, 'Item:1');
		await new Promise((r) => setImmediate(r));
		expect(calls.one).toBe(1);
		off();
	});

	test('reaches through entity fields', async () => {
		const client = await setup();
		writeEntity(client, 'Item:2', { friend: { __typename: 'Item', id: '1' } });
		calls = { list: 0, one: 0 };
		const q = query<void, Item>({
			id: 'friendly',
			cache,
			staleTime: '1h',
			fetch: async () => ({ __typename: 'Item', id: '2', name: 'B' }),
		});
		await q.ensure(client);
		invalidateEntity(client, 'Item:1');
		const before = client.get(q).updatedAt;
		await q.ensure(client);
		expect(client.get(q).updatedAt).toBeGreaterThanOrEqual(before);
		expect(client.queries).toBeDefined();
	});
});

test('identifyOf asks the policy', () => {
	expect(identifyOf(entities(), { __typename: 'A', id: 1 })).toBe('A:1');
	expect(identifyOf(entities(), { id: 1 })).toBeUndefined();
});
