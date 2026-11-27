import { describe, expect, test } from 'bun:test';
import { fakeEnv, settle } from '../../test/ssr';
import { RivaError, RivaHttpError } from '../errors';
import { type FetchContext, query } from '../query';
import { signal } from '../signal';
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
	test('an entry still streaming is left out: the client fetches it', async () => {
		const riva = fakeEnv().riva();
		const ctxs: FetchContext[] = [];
		const parted = query<void, string>({
			id: 'parted',
			fetch: (_v, ctx) => {
				ctxs.push(ctx);
				return new Promise<string>(() => {});
			},
		});
		void parted.ensure(riva).catch(() => {});
		ctxs[0]?.onPart?.('first part');
		expect(riva.get(parted)).toMatchObject({ dataState: 'streaming' });
		expect(dehydrate(riva).q).toEqual([]);
	});

	test('a success is dehydrated with its encoded data and its age', async () => {
		const { riva: make, sched } = fakeEnv();
		const riva = make();
		await items.ensure(riva, { page: 1 });
		sched.advance(250);
		const snap = dehydrate(riva);
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

	test('an error carries its code, status and retryability, never a message, a stack or a cause', async () => {
		const riva = fakeEnv().riva();
		const failing = query<void, string>({
			id: 'failing',
			retry: 0,
			fetch: async () => {
				throw new RivaHttpError(503, 'Unavailable', { cause: new Error('x') });
			},
		});
		await failing.ensure(riva).catch(() => {});
		const json = JSON.stringify(dehydrate(riva));
		expect(JSON.parse(json).q[0]).toMatchObject({
			s: 'error',
			e: {
				code: 'HTTP_503',
				status: 503,
				retryable: true,
			},
		});
		expect(json).not.toContain('Unavailable');
		expect(json).not.toContain('stack');
		expect(json).not.toContain('cause');
	});

	test('a RivaError without status carries no status, a message never travels, anything else is RIVA_UNKNOWN', async () => {
		const riva = fakeEnv().riva();
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
		await a.ensure(riva).catch(() => {});
		await b.ensure(riva).catch(() => {});
		const q = dehydrate(riva).q;
		expect(q.find((e) => e.k.startsWith('a:'))?.e).toEqual({
			code: 'MY_CODE',
		});
		expect(q.find((e) => e.k.startsWith('b:'))?.e).toEqual({
			code: 'RIVA_UNKNOWN',
		});
		expect(JSON.stringify(q)).not.toContain('secret detail');
		expect(JSON.stringify(q)).not.toContain('mine');
	});

	test('idle and in-flight entries without data are skipped', async () => {
		const riva = fakeEnv().riva();
		const slow = query<void, string>({
			id: 'slow',
			fetch: () => new Promise<string>(() => {}),
		});
		riva.get(items, { page: 9 });
		const p = slow.ensure(riva);
		p.catch(() => {});
		await settle();
		expect(dehydrate(riva).q).toEqual([]);
	});

	test('optimistic layers are left out', async () => {
		const riva = fakeEnv().riva();
		await items.ensure(riva, { page: 1 });
		riva.queries.lay(items, { page: 1 }, () => ({
			n: 99,
			at: new Date(0),
		}));
		expect(riva.get(items, { page: 1 }).data?.n).toBe(99);
		expect(dehydrate(riva).q[0]?.d).toMatchObject({ n: 1 });
	});

	test('an invalidated entry is flagged', async () => {
		const riva = fakeEnv().riva();
		await items.ensure(riva, { page: 1 });
		items.invalidate(riva, { page: 1 });
		expect(dehydrate(riva).q[0]?.i).toBe(1);
	});

	test('a value the codec refuses names the entry', async () => {
		const riva = fakeEnv().riva();
		const bad = query<void, Map<string, number>>({
			id: 'bad',
			fetch: async () => new Map(),
		});
		await bad.ensure(riva);
		expect(() => dehydrate(riva)).toThrow(
			'Cannot dehydrate an instance of Map at bad:.data',
		);
	});
});

describe('signals', () => {
	test('only changed, named signals that opted in travel', () => {
		const riva = fakeEnv().riva();
		const changed = signal(1, { name: 'changed', ssr: true });
		const same = signal(1, { name: 'same', ssr: true });
		const anonymous = signal(1, { ssr: true });
		const local = signal(1, { name: 'local' });
		const when = signal(new Date(0), { name: 'when', ssr: true });
		for (const a of [changed, same, anonymous, local]) riva.get(a);
		riva.get(when);
		riva.set(changed, 2);
		riva.set(anonymous, 2);
		riva.set(local, 2);
		riva.set(when, new Date(5));
		expect(dehydrate(riva).a).toEqual({
			changed: 2,
			when: { $t: 'D', v: '1970-01-01T00:00:00.005Z' },
		});
	});

	test('internal signals never travel', async () => {
		const riva = fakeEnv().riva();
		await items.ensure(riva, { page: 1 });
		expect(dehydrate(riva).a).toEqual({});
	});

	test('two signals with one name throw', () => {
		const riva = fakeEnv().riva();
		riva.get(signal(1, { name: 'twin', ssr: true }));
		riva.get(signal(2, { name: 'twin', ssr: true }));
		expect(() => dehydrate(riva)).toThrow(
			'Cannot dehydrate: two signals are named "twin". Give each SSR signal a unique name, or set ssr: false.',
		);
		try {
			dehydrate(riva);
		} catch (e) {
			expect((e as RivaError).code).toBe('RIVA_SSR');
		}
	});
});
