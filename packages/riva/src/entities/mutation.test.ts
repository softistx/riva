import { describe, expect, test } from 'bun:test';
import { createRiva } from '../client';
import { RivaHttpError } from '../errors';
import { mutation } from '../mutation';
import { query } from '../query';
import { readEntity } from './api';
import { entities, storeOf } from './policy';

type P = {
	// biome-ignore lint/style/useNamingConvention: GraphQL's field name
	__typename: 'Patient';
	id: string;
	name: string;
};
const cache = entities();
const staleTime = '1h';
const one = query<{ id: string }, P>({
	id: 'one',
	cache,
	staleTime,
	fetch: async (v) => ({ __typename: 'Patient', id: v.id, name: 'Ann' }),
});
const all = query<void, { items: P[] }>({
	id: 'all',
	cache,
	staleTime,
	fetch: async () => ({
		items: [{ __typename: 'Patient', id: '1', name: 'Ann' }],
	}),
});

const deferred = <T>() => {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((a, b) => {
		resolve = a;
		reject = b;
	});
	return { promise, resolve, reject };
};

const rename = (mutate: (name: string) => Promise<P>) =>
	mutation<{ id: string; name: string }, P>({
		id: 'rename',
		cache,
		mutate: (v) => mutate(v.name),
		optimistic: (v) => ({ __typename: 'Patient', id: v.id, name: v.name }),
	});

describe('mutations over entities()', () => {
	test('the optimistic layer shows in every query sharing the entity, then rolls back', async () => {
		const riva = createRiva();
		await one.ensure(riva, { id: '1' });
		await all.ensure(riva);
		const seen: string[] = [];
		const off1 = riva.subscribe(one, { id: '1' }, (s) =>
			seen.push(`one:${s.data?.name}`),
		);
		const off2 = riva.subscribe(all, (s) =>
			seen.push(`all:${s.data?.items[0]?.name}`),
		);
		const d = deferred<P>();
		const p = rename(() => d.promise).mutate(riva, { id: '1', name: 'Zed' });
		expect(riva.get(one, { id: '1' }).data?.name).toBe('Zed');
		expect(riva.get(all).data?.items[0]?.name).toBe('Zed');
		expect(riva.get(all).status).toBe('success');
		// the committed store is untouched while the layer is on
		expect(storeOf(riva).peek('Patient:1')?.['name']).toBe('Ann');
		d.reject(new RivaHttpError(400));
		await p.catch(() => {});
		expect(riva.get(one, { id: '1' }).data?.name).toBe('Ann');
		expect(riva.get(all).data?.items[0]?.name).toBe('Ann');
		expect(seen).toContain('one:Zed');
		expect(seen).toContain('all:Zed');
		off1();
		off2();
	});

	test('success commits the server result in one transition', async () => {
		const riva = createRiva();
		await one.ensure(riva, { id: '1' });
		const names: Array<string | undefined> = [];
		const off = riva.subscribe(one, { id: '1' }, (s) =>
			names.push(s.data?.name),
		);
		const d = deferred<P>();
		const p = rename(() => d.promise).mutate(riva, { id: '1', name: 'Zed' });
		d.resolve({ __typename: 'Patient', id: '1', name: 'Zed (server)' });
		await p;
		expect(names).toEqual(['Zed', 'Zed (server)']);
		expect(storeOf(riva).peek('Patient:1')?.['name']).toBe('Zed (server)');
		off();
	});

	test('an entity created by the layer exists only until it settles', async () => {
		const riva = createRiva();
		const d = deferred<P>();
		const p = rename(() => d.promise).mutate(riva, { id: '9', name: 'New' });
		expect(readEntity(riva, 'Patient:9')).toMatchObject({ name: 'New' });
		d.reject(new Error('x'));
		await p.catch(() => {});
		expect(readEntity(riva, 'Patient:9')).toBeUndefined();
	});

	test('layers apply in start order and a failed one leaves the other', async () => {
		const riva = createRiva();
		await one.ensure(riva, { id: '1' });
		const da = deferred<P>();
		const db = deferred<P>();
		const a = rename(() => da.promise).mutate(riva, { id: '1', name: 'A' });
		const b = rename(() => db.promise).mutate(riva, { id: '1', name: 'B' });
		expect(riva.get(one, { id: '1' }).data?.name).toBe('B');
		db.resolve({ __typename: 'Patient', id: '1', name: 'B' });
		await Promise.resolve();
		expect(storeOf(riva).peek('Patient:1')?.['name']).toBe('Ann');
		da.resolve({ __typename: 'Patient', id: '1', name: 'A' });
		await Promise.all([a, b]);
		// A committed first, then B: B wins.
		expect(riva.get(one, { id: '1' }).data?.name).toBe('B');
		const dc = deferred<P>();
		const dd = deferred<P>();
		const c = rename(() => dc.promise).mutate(riva, { id: '1', name: 'C' });
		const d = rename(() => dd.promise).mutate(riva, { id: '1', name: 'D' });
		dc.reject(new Error('x'));
		await c.catch(() => {});
		expect(riva.get(one, { id: '1' }).data?.name).toBe('D');
		dd.reject(new Error('y'));
		await d.catch(() => {});
		expect(riva.get(one, { id: '1' }).data?.name).toBe('B');
	});

	test('a refetch during a layer updates the committed entity; the layer stays on top', async () => {
		const riva = createRiva();
		await one.ensure(riva, { id: '1' });
		const d = deferred<P>();
		const p = rename(() => d.promise).mutate(riva, { id: '1', name: 'Zed' });
		one.setData(
			riva,
			{ id: '1' },
			{
				__typename: 'Patient',
				id: '1',
				name: 'Refetched',
			},
		);
		expect(storeOf(riva).peek('Patient:1')?.['name']).toBe('Refetched');
		expect(riva.get(one, { id: '1' }).data?.name).toBe('Zed');
		d.reject(new Error('x'));
		await p.catch(() => {});
		expect(riva.get(one, { id: '1' }).data?.name).toBe('Refetched');
	});

	test('data the cache cannot store rejects the optimistic call and the commit', async () => {
		const riva = createRiva();
		await one.ensure(riva, { id: '1' });
		const bad = mutation<void, unknown>({
			id: 'bad',
			cache,
			mutate: async () => ({ __typename: 'Patient', id: '1', f: () => 1 }),
		});
		await expect(bad.mutate(riva)).rejects.toMatchObject({
			code: 'RIVA_CACHE',
		});
		const bad2 = mutation<void, unknown>({
			id: 'bad2',
			cache,
			mutate: async () => 1,
			optimistic: () => ({ __typename: 'Patient', id: '1', f: () => 1 }),
		});
		await expect(bad2.mutate(riva)).rejects.toMatchObject({
			code: 'RIVA_CACHE',
		});
		expect(riva.get(one, { id: '1' }).data?.name).toBe('Ann');
	});

	test('two riva instances keep their own layers', async () => {
		const c1 = createRiva();
		const c2 = createRiva();
		await one.ensure(c1, { id: '1' });
		await one.ensure(c2, { id: '1' });
		const d = deferred<P>();
		const p = rename(() => d.promise).mutate(c1, { id: '1', name: 'Zed' });
		expect(c2.get(one, { id: '1' }).data?.name).toBe('Ann');
		d.reject(new Error('x'));
		await p.catch(() => {});
	});
});

test('setData during a live layer starts from the committed data and keeps no optimistic field', async () => {
	type Q = P & { n?: number };
	const q = query<{ id: string }, Q>({
		id: 'q',
		cache,
		staleTime,
		fetch: async (v) => ({ __typename: 'Patient', id: v.id, name: 'a' }),
	});
	const riva = createRiva();
	await q.ensure(riva, { id: '1' });
	const d = deferred<P>();
	const p = rename(() => d.promise).mutate(riva, { id: '1', name: 'OPT' });
	expect(riva.get(q, { id: '1' }).data?.name).toBe('OPT');
	q.setData(riva, { id: '1' }, (prev) => ({ ...(prev as Q), n: 5 }));
	d.reject(new Error('x'));
	await p.catch(() => {});
	expect(riva.get(q, { id: '1' }).data).toMatchObject({ name: 'a', n: 5 });
});
