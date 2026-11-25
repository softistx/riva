import { describe, expect, test } from 'bun:test';
import { createRivaClient } from '../client';
import { computed } from '../computed';
import type { Scheduler } from '../env';
import { RivaError } from '../errors';
import { query } from '../query';
import { readEntity, writeEntity } from './api';
import { entities, storeOf } from './policy';

function fakeScheduler() {
	let t = 1_000_000;
	let id = 0;
	const timers = new Map<number, { at: number; fn: () => void }>();
	const sched: Scheduler & { advance(ms: number): void } = {
		now: () => t,
		setTimeout(fn, ms) {
			timers.set(++id, { at: t + ms, fn });
			return id;
		},
		clearTimeout: (h) => void timers.delete(h as number),
		advance(ms) {
			t += ms;
			for (const [k, x] of [...timers])
				if (x.at <= t) {
					timers.delete(k);
					x.fn();
				}
		},
	};
	return sched;
}

const cache = entities();
type P = {
	// biome-ignore lint/style/useNamingConvention: GraphQL's field name
	__typename: string;
	id: string;
	name: string;
	// biome-ignore lint/style/useNamingConvention: GraphQL's field name
	doctor?: { __typename: string; id: string; room: string };
};
let db: Record<string, P> = {};
const one = query<{ id: string }, P>({
	id: 'one',
	cache,
	gcTime: 1000,
	fetch: async (v) => structuredClone(db[v.id]) as P,
});
const all = query<void, { items: P[]; total: number }>({
	id: 'all',
	cache,
	gcTime: 1000,
	fetch: async () => ({ items: Object.values(structuredClone(db)), total: 2 }),
});
const plain = query<void, { items: P[] }>({
	id: 'plain',
	fetch: async () => ({ items: Object.values(structuredClone(db)) }),
});

const reset = () => {
	db = {
		'1': {
			__typename: 'Patient',
			id: '1',
			name: 'Ann',
			doctor: { __typename: 'Doctor', id: 'd', room: '1' },
		},
		'2': { __typename: 'Patient', id: '2', name: 'Bob' },
	};
};

describe('entities() as a query cache policy', () => {
	test('data round-trips with entities shared in the store', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		const data = await all.ensure(client);
		expect(data).toEqual({ items: Object.values(db), total: 2 });
		expect(client.get(all).data).toEqual(data);
		const store = storeOf(client);
		expect([...store.signals.keys()].sort()).toEqual([
			'Doctor:d',
			'Patient:1',
			'Patient:2',
		]);
	});

	test('two queries sharing an entity: a refetch of one updates the other', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		await all.ensure(client);
		await one.ensure(client, { id: '1' });
		db['1'] = { ...(db['1'] as P), name: 'Ann B' };
		await one.ensure(client, { id: '1' }).catch(() => {});
		one.invalidate(client, { id: '1' });
		await one.ensure(client, { id: '1' });
		expect(client.get(all).data?.items[0]?.name).toBe('Ann B');
		expect(client.get(one, { id: '1' }).data?.name).toBe('Ann B');
	});

	test('a client.get inside a computed re-evaluates on a shared change; an unrelated one does not', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		await all.ensure(client);
		await one.ensure(client, { id: '2' });
		let runs = 0;
		const name = computed(() => {
			runs++;
			return client.get(one, { id: '2' }).data?.name;
		});
		const seen: unknown[] = [];
		client.subscribe(name, (v) => seen.push(v));
		db['1'] = { ...(db['1'] as P), name: 'Changed' };
		all.invalidate(client);
		await all.ensure(client);
		expect(runs).toBe(1);
		db['2'] = { ...(db['2'] as P), name: 'Bobby' };
		all.invalidate(client);
		await all.ensure(client);
		expect(seen).toEqual(['Bobby']);
		expect(runs).toBe(2);
	});

	test('identity kept for an unchanged read, and for unchanged entities after another changed', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		await all.ensure(client);
		const a = client.get(all);
		expect(client.get(all)).toBe(a);
		expect(client.get(all).data).toBe(a.data);
		db['2'] = { ...(db['2'] as P), name: 'Bobby' };
		all.invalidate(client);
		await all.ensure(client);
		const b = client.get(all).data;
		expect(b?.items[0]).toBe(a.data?.items[0]);
		expect(b?.items[1]).not.toBe(a.data?.items[1]);
	});

	test('subscribers of the entry see the denormalized data', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		const seen: unknown[] = [];
		const off = client.subscribe(one, { id: '2' }, (s) =>
			seen.push(s.data?.name),
		);
		await one.ensure(client, { id: '2' });
		off();
		expect(seen).toContain('Bob');
	});

	test('setData stores through the policy and the updater sees denormalized data', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		await all.ensure(client);
		all.setData(client, undefined as never, (prev) => ({
			total: 1,
			items: (prev?.items ?? [])
				.slice(0, 1)
				.map((p) => ({ ...p, name: 'Set' })),
		}));
		expect(client.get(all).data?.items[0]?.name).toBe('Set');
		expect(storeOf(client).peek('Patient:1')?.['name']).toBe('Set');
		// Patient:2 left the data, so its last hold was released
		expect(storeOf(client).peek('Patient:2')).toBeUndefined();
	});

	test('GC: entities leave with the last entry that holds them', async () => {
		reset();
		const sched = fakeScheduler();
		const client = createRivaClient({ scheduler: sched });
		await all.ensure(client);
		await one.ensure(client, { id: '1' });
		const store = storeOf(client);
		sched.advance(1001);
		// both entries are collected: nothing holds any entity
		expect(store.peek('Patient:1')).toBeUndefined();
		expect(store.peek('Doctor:d')).toBeUndefined();
		expect(store.signals.size).toBe(0);
	});

	test('GC keeps an entity another entry still holds', async () => {
		reset();
		const sched = fakeScheduler();
		const client = createRivaClient({ scheduler: sched });
		await one.ensure(client, { id: '1' });
		sched.advance(500);
		await all.ensure(client);
		sched.advance(600);
		const store = storeOf(client);
		expect(store.peek('Patient:1')?.['name']).toBe('Ann');
		expect(store.peek('Doctor:d')).toBeDefined();
		sched.advance(1000);
		expect(store.peek('Patient:1')).toBeUndefined();
	});

	test('a refetch that drops an entity releases it', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		await all.ensure(client);
		delete db['2'];
		all.invalidate(client);
		await all.ensure(client);
		expect(storeOf(client).peek('Patient:2')).toBeUndefined();
		expect(storeOf(client).peek('Patient:1')).toBeDefined();
	});

	test('two clients stay isolated', async () => {
		reset();
		const a = createRivaClient({ scheduler: fakeScheduler() });
		const b = createRivaClient({ scheduler: fakeScheduler() });
		await all.ensure(a);
		await all.ensure(b);
		db['1'] = { ...(db['1'] as P), name: 'Only A' };
		all.invalidate(a);
		await all.ensure(a);
		expect(a.get(all).data?.items[0]?.name).toBe('Only A');
		expect(b.get(all).data?.items[0]?.name).toBe('Ann');
		expect(storeOf(a)).not.toBe(storeOf(b));
	});

	test('RIVA_CACHE: a non-JSON result is refused, the entry shows the error and keeps its data', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		let bad = false;
		const q = query<void, unknown>({
			id: 'bad',
			cache,
			fetch: async () => (bad ? { fn: () => 1 } : { __typename: 'A', id: '1' }),
		});
		await q.ensure(client);
		bad = true;
		q.invalidate(client);
		const err = (await q.ensure(client).catch((e) => e)) as RivaError;
		expect(err).toBeInstanceOf(RivaError);
		expect(err.code).toBe('RIVA_CACHE');
		const s = client.get(q);
		expect(s.status).toBe('error');
		expect(s.isFetching).toBe(false);
		expect(s.data).toEqual({ __typename: 'A', id: '1' });
		expect(() => q.setData(client, undefined, { fn: () => 1 })).toThrow(
			RivaError,
		);
	});

	test('entities that reference each other are collected with their entries', async () => {
		const sched = fakeScheduler();
		const client = createRivaClient({ scheduler: sched });
		const cyc = query<void, unknown>({
			id: 'cyc',
			cache,
			gcTime: 1000,
			fetch: async () => ({
				__typename: 'A',
				id: '2',
				b: { __typename: 'B', id: '2', a: { __typename: 'A', id: '2' } },
			}),
		});
		await cyc.ensure(client);
		expect(storeOf(client).signals.size).toBe(2);
		sched.advance(1001);
		expect(storeOf(client).signals.size).toBe(0);
	});

	test('a policy with other identity rules than the client already uses is refused', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		await all.ensure(client);
		const other = query<void, unknown>({
			id: 'other',
			// biome-ignore lint/style/useNamingConvention: a type name
			cache: entities({ keys: { Patient: (p) => p['name'] as string } }),
			fetch: async () => ({ __typename: 'Patient', id: '1', name: 'Ann' }),
		});
		const err = (await other.ensure(client).catch((e) => e)) as RivaError;
		expect(err).toBeInstanceOf(RivaError);
		expect(err.code).toBe('RIVA_CACHE');
		expect(err.message).toContain('other entity identity rules');
	});

	test('two inline entities() with the same options objects share one client', async () => {
		// biome-ignore lint/style/useNamingConvention: a type name
		const keys = { Book: (b: Record<string, unknown>) => b['isbn'] as string };
		const client = createRivaClient({ scheduler: fakeScheduler() });
		const mk = (id: string) =>
			query<void, unknown>({
				id,
				cache: entities({ keys }),
				fetch: async () => ({ __typename: 'Book', isbn: 'x', title: id }),
			});
		await mk('a').ensure(client);
		await mk('b').ensure(client);
		expect([...storeOf(client).signals.keys()]).toEqual(['Book:x']);
	});

	test('a store made by writeEntity binds to a later policy only while empty', async () => {
		// biome-ignore lint/style/useNamingConvention: a type name
		const keys = { Book: (b: Record<string, unknown>) => b['isbn'] as string };
		const book = (c: ReturnType<typeof createRivaClient>) =>
			query<void, unknown>({
				id: 'book',
				cache: entities({ keys }),
				fetch: async () => ({ __typename: 'Book', isbn: 'x' }),
			}).ensure(c);
		const empty = createRivaClient({ scheduler: fakeScheduler() });
		writeEntity(empty, 'Book:1', { a: 1 });
		storeOf(empty).clear('Book:1');
		expect(await book(empty)).toEqual({ __typename: 'Book', isbn: 'x' });
		const used = createRivaClient({ scheduler: fakeScheduler() });
		writeEntity(used, 'Book:1', { a: 1 });
		const err = (await book(used).catch((e) => e)) as RivaError;
		expect(err.code).toBe('RIVA_CACHE');
	});

	test('setData with an explicit undefined releases the previous entities', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		await all.ensure(client);
		all.setData(client, undefined as never, undefined as never);
		expect(client.get(all).data).toBeUndefined();
		expect(storeOf(client).signals.size).toBe(0);
	});

	test('a root that is an array keeps its identity when a refetch changes nothing', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		const list = query<void, P[]>({
			id: 'list',
			cache,
			fetch: async () => Object.values(structuredClone(db)),
		});
		await list.ensure(client);
		const a = client.get(list).data;
		list.invalidate(client);
		await list.ensure(client);
		expect(client.get(list).data).toBe(a);
	});

	test('a refused setData throws and leaves the entry untouched', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		await all.ensure(client);
		const before = client.get(all);
		expect(() =>
			all.setData(client, undefined as never, { items: [() => 1] } as never),
		).toThrow(RivaError);
		expect(client.get(all)).toBe(before);
		expect(storeOf(client).signals.size).toBe(3);
	});

	test('a missing entity read outside a computed leaves no signal', () => {
		const client = createRivaClient({ scheduler: fakeScheduler() });
		expect(readEntity(client, 'Patient:404')).toBeUndefined();
		expect(storeOf(client).signals.size).toBe(0);
	});

	test('without a cache option the state is stored as is, the same object', async () => {
		reset();
		const client = createRivaClient({ scheduler: fakeScheduler() });
		const data = await plain.ensure(client);
		expect(client.get(plain).data).toBe(data);
		expect(client.get(plain)).toBe(client.get(plain));
	});
});

describe('a custom codec', () => {
	test('normalizes with the variables of the query and denormalizes through the reader', async () => {
		const seen: unknown[] = [];
		const policy = entities(undefined, {
			normalize: (_store, data, vars) => {
				seen.push(vars);
				return { root: data, pending: new Map([['A:1', { n: 1 }]]) };
			},
			denormalize: (store) => store.fields('A:1'),
		});
		const q = query<{ k: number }, unknown>({
			id: 'codec',
			cache: policy,
			fetch: async () => ({ any: true }),
		});
		const client = createRivaClient();
		await q.ensure(client, { k: 7 });
		expect(seen).toEqual([{ k: 7 }]);
		expect(client.get(q, { k: 7 }).data).toEqual({ n: 1 });
		expect(readEntity(client, 'A:1')).toEqual({ n: 1 });
	});
});
