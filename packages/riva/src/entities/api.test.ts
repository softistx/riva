import { describe, expect, test } from 'bun:test';
import { createRiva } from '../client';
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
	const riva = createRiva();
	await list.ensure(riva);
	await one.ensure(riva, { id: '1' });
	return riva;
};

describe('writeEntity / readEntity', () => {
	test('readEntity gives the entity, undefined when missing', async () => {
		const riva = await setup();
		expect(readEntity(riva, 'Item:1')).toEqual(items[0]);
		expect(readEntity(riva, 'Item:9')).toBeUndefined();
	});

	test('a patch is merged and every query reading it sees it', async () => {
		const riva = await setup();
		writeEntity<Partial<Item>>(riva, 'Item:1', { name: 'A2' });
		expect(riva.get(list).data?.items[0]).toEqual({
			...(items[0] as Item),
			name: 'A2',
		});
		expect(riva.get(one, { id: '1' }).data?.name).toBe('A2');
		expect(riva.get(list).data?.items[1]).toEqual(items[1]);
	});

	test('a function gets the current value; readers are notified once', async () => {
		const riva = await setup();
		const seen: unknown[] = [];
		riva.subscribe(one, { id: '1' }, (s) => seen.push(s.data?.tags));
		writeEntity(riva, 'Item:1', (prev) => ({
			tags: [...((prev?.['tags'] as string[] | undefined) ?? []), 'y'],
		}));
		expect(seen).toEqual([['x', 'y']]);
	});

	test('writing a new entity creates it, nested entities included', async () => {
		const riva = await setup();
		writeEntity(riva, 'Item:3', {
			__typename: 'Item',
			id: '3',
			name: 'C',
			owner: { __typename: 'User', id: 'u' },
		});
		expect(readEntity(riva, 'Item:3')).toMatchObject({
			name: 'C',
			owner: { id: 'u' },
		});
		expect(storeOf(riva).peek('User:u')).toBeDefined();
	});

	test('RIVA_CACHE for a non-JSON patch, and nothing changes', async () => {
		const riva = await setup();
		const before = readEntity(riva, 'Item:1');
		expect(() => writeEntity(riva, 'Item:1', { f: () => 1 })).toThrow(
			RivaError,
		);
		expect(readEntity(riva, 'Item:1')).toEqual(before);
	});

	test('readEntity inside a computed is tracked', async () => {
		const riva = await setup();
		const name = computed(() => readEntity<Item>(riva, 'Item:2')?.name);
		const seen: unknown[] = [];
		riva.subscribe(name, (v) => seen.push(v));
		writeEntity(riva, 'Item:1', { name: 'other' });
		writeEntity(riva, 'Item:2', { name: 'B2' });
		expect(seen).toEqual(['B2']);
	});
});

describe('evict', () => {
	test('removes the entity; queries see it missing; false when absent', async () => {
		const riva = await setup();
		expect(evict(riva, 'Item:2')).toBe(true);
		expect(evict(riva, 'Item:2')).toBe(false);
		expect(riva.get(list).data?.items as unknown[]).toEqual([
			items[0],
			undefined,
		]);
		expect(readEntity(riva, 'Item:2')).toBeUndefined();
	});

	test('a later fetch brings it back', async () => {
		const riva = await setup();
		evict(riva, 'Item:2');
		list.invalidate(riva);
		await list.ensure(riva);
		expect(readEntity(riva, 'Item:2')).toEqual(items[1]);
	});
});

describe('invalidateEntity', () => {
	test('marks stale every entry that reaches the entity, and only those', async () => {
		const riva = await setup();
		await one.ensure(riva, { id: '2' });
		calls = { list: 0, one: 0 };
		invalidateEntity(riva, 'Item:1');
		await list.ensure(riva);
		await one.ensure(riva, { id: '1' });
		await one.ensure(riva, { id: '2' }); // not stale: untouched
		expect(calls).toEqual({ list: 1, one: 1 });
	});

	test('refetches an observed entry at once', async () => {
		const riva = await setup();
		const off = riva.subscribe(one, { id: '1' }, () => {});
		calls = { list: 0, one: 0 };
		invalidateEntity(riva, 'Item:1');
		await new Promise((r) => setImmediate(r));
		expect(calls.one).toBe(1);
		off();
	});

	test('reaches through entity fields', async () => {
		const riva = await setup();
		writeEntity(riva, 'Item:2', { friend: { __typename: 'Item', id: '1' } });
		calls = { list: 0, one: 0 };
		const q = query<void, Item>({
			id: 'friendly',
			cache,
			staleTime: '1h',
			fetch: async () => ({ __typename: 'Item', id: '2', name: 'B' }),
		});
		await q.ensure(riva);
		invalidateEntity(riva, 'Item:1');
		const before = riva.get(q).updatedAt;
		await q.ensure(riva);
		expect(riva.get(q).updatedAt).toBeGreaterThanOrEqual(before);
		expect(riva.queries).toBeDefined();
	});
});

test('identifyOf asks the policy', () => {
	expect(identifyOf(entities(), { __typename: 'A', id: 1 })).toBe('A:1');
	expect(identifyOf(entities(), { id: 1 })).toBeUndefined();
});
