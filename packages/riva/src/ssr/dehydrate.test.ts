import { describe, expect, test } from 'bun:test';
import { fakeEnv, settle } from '../../test/ssr';
import { atom } from '../atom';
import { RivaError, RivaHttpError } from '../errors';
import { query } from '../query';
import { dehydrate } from './index';

const items = query<{ page: number }, { n: number; at: Date }>({
	id: 'items',
	fetch: async ({ page }) => ({
		n: page,
		at: new Date('2026-03-04T00:00:00Z'),
	}),
	retry: 0,
});

describe('entries', () => {
	test('a success is dehydrated with its encoded data and its age', async () => {
		const { client: make, sched } = fakeEnv();
		const client = make();
		await items.ensure(client, { page: 1 });
		sched.advance(250);
		const snap = dehydrate(client);
		expect(snap.v).toBe(1);
		expect(snap.t).toBe(sched.now());
		expect(snap.q).toEqual([
			{
				k: 'items:{"page":1}',
				s: 'success',
				d: { n: 1, at: { $t: 'D', v: '2026-03-04T00:00:00.000Z' } },
				u: 250,
			},
		]);
		expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
	});

	test('an error carries its code, status and message, never a stack or a cause', async () => {
		const client = fakeEnv().client();
		const failing = query<void, string>({
			id: 'failing',
			retry: 0,
			fetch: async () => {
				throw new RivaHttpError(503, 'Unavailable', { cause: new Error('x') });
			},
		});
		await failing.ensure(client).catch(() => {});
		const json = JSON.stringify(dehydrate(client));
		expect(JSON.parse(json).q[0]).toMatchObject({
			s: 'error',
			e: {
				code: 'HTTP_503',
				message: 'Unavailable',
				status: 503,
				retryable: true,
			},
		});
		expect(json).not.toContain('stack');
		expect(json).not.toContain('cause');
	});

	test('a RivaError without status carries no status, anything else is RIVA_UNKNOWN with no message', async () => {
		const client = fakeEnv().client();
		const a = query<void, string>({
			id: 'a',
			retry: 0,
			fetch: async () => {
				throw new RivaError('MY_CODE', 'mine');
			},
		});
		const b = query<void, string>({
			id: 'b',
			retry: 0,
			fetch: async () => {
				throw new Error('secret detail');
			},
		});
		await a.ensure(client).catch(() => {});
		await b.ensure(client).catch(() => {});
		const q = dehydrate(client).q;
		expect(q.find((e) => e.k.startsWith('a:'))?.e).toEqual({
			code: 'MY_CODE',
			message: 'mine',
		});
		expect(q.find((e) => e.k.startsWith('b:'))?.e).toEqual({
			code: 'RIVA_UNKNOWN',
		});
		expect(JSON.stringify(q)).not.toContain('secret detail');
	});

	test('idle and in-flight entries without data are skipped', async () => {
		const client = fakeEnv().client();
		const slow = query<void, string>({
			id: 'slow',
			fetch: () => new Promise<string>(() => {}),
		});
		client.get(items, { page: 9 });
		const p = slow.ensure(client);
		p.catch(() => {});
		await settle();
		expect(dehydrate(client).q).toEqual([]);
	});

	test('optimistic layers are left out', async () => {
		const client = fakeEnv().client();
		await items.ensure(client, { page: 1 });
		client.queries.lay(items, { page: 1 }, () => ({
			n: 99,
			at: new Date(0),
		}));
		expect(client.get(items, { page: 1 }).data?.n).toBe(99);
		expect(dehydrate(client).q[0]?.d).toMatchObject({ n: 1 });
	});

	test('an invalidated entry is flagged', async () => {
		const client = fakeEnv().client();
		await items.ensure(client, { page: 1 });
		items.invalidate(client, { page: 1 });
		expect(dehydrate(client).q[0]?.i).toBe(1);
	});

	test('a value the codec refuses names the entry', async () => {
		const client = fakeEnv().client();
		const bad = query<void, Map<string, number>>({
			id: 'bad',
			fetch: async () => new Map(),
		});
		await bad.ensure(client);
		expect(() => dehydrate(client)).toThrow(
			'Cannot dehydrate a Map instance at bad:.data',
		);
	});
});

describe('atoms', () => {
	test('only changed, named, ssr atoms travel', () => {
		const client = fakeEnv().client();
		const changed = atom(1, { name: 'changed' });
		const same = atom(1, { name: 'same' });
		const anonymous = atom(1);
		const local = atom(1, { name: 'local', ssr: false });
		const when = atom(new Date(0), { name: 'when' });
		for (const a of [changed, same, anonymous, local]) client.get(a);
		client.get(when);
		client.set(changed, 2);
		client.set(anonymous, 2);
		client.set(local, 2);
		client.set(when, new Date(5));
		expect(dehydrate(client).a).toEqual({
			changed: 2,
			when: { $t: 'D', v: '1970-01-01T00:00:00.005Z' },
		});
	});

	test('internal atoms never travel', async () => {
		const client = fakeEnv().client();
		await items.ensure(client, { page: 1 });
		expect(dehydrate(client).a).toEqual({});
	});

	test('two atoms with one name throw', () => {
		const client = fakeEnv().client();
		client.get(atom(1, { name: 'twin' }));
		client.get(atom(2, { name: 'twin' }));
		expect(() => dehydrate(client)).toThrow(
			'Cannot dehydrate: two atoms are named "twin". Give each SSR atom a unique name, or set ssr: false.',
		);
		try {
			dehydrate(client);
		} catch (e) {
			expect((e as RivaError).code).toBe('RIVA_SSR');
		}
	});
});
