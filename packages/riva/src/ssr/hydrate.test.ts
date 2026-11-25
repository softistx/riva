import { describe, expect, test } from 'bun:test';
import { fakeEnv, settle } from '../../test/ssr';
import { signal } from '../signal';
import { createRivaClient } from '../client';
import { entities } from '../entities';
import { readEntity } from '../entities/api';
import {
	RivaAbortError,
	RivaError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '../errors';
import { infinite } from '../infinite';
import { query } from '../query';
import { dehydrate, hydrate } from './index';

function counted(id = 'items', staleTime: number | undefined = 60_000) {
	const calls: number[] = [];
	const q = query<{ page: number }, { n: number; at: Date }>({
		id,
		retry: 0,
		...(staleTime !== undefined && { staleTime }),
		fetch: async ({ page }) => {
			calls.push(page);
			return { n: page, at: new Date('2026-03-04T00:00:00Z') };
		},
	});
	return { q, calls };
}

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v));

async function served(page = 1) {
	const env = fakeEnv();
	const server = env.client();
	const { q, calls } = counted();
	await q.ensure(server, { page });
	return { env, q, calls, snap: roundTrip(dehydrate(server)) };
}

describe('seeding', () => {
	test('an entry is seeded before its definition is known, and a fresh one never refetches', async () => {
		const { env, q, calls, snap } = await served();
		calls.length = 0;
		const browser = env.client();
		expect(hydrate(browser, snap)).toBeUndefined();
		const seen: unknown[] = [];
		const off = browser.subscribe(q, { page: 1 }, (s) => seen.push(s.status));
		await settle();
		off();
		expect(calls).toEqual([]);
		const state = browser.get(q, { page: 1 });
		expect(state.status).toBe('success');
		expect(state.data?.at).toBeInstanceOf(Date);
		expect(state.data?.n).toBe(1);
	});

	test('a stale entry shows its data and refetches on subscribing', async () => {
		const env = fakeEnv();
		const server = env.client();
		const { q, calls } = counted('stale', 0);
		await q.ensure(server, { page: 1 });
		const snap = roundTrip(dehydrate(server));
		calls.length = 0;
		const browser = env.client();
		hydrate(browser, snap);
		expect(browser.get(q, { page: 1 }).data?.n).toBe(1);
		const off = browser.subscribe(q, { page: 1 }, () => {});
		await settle();
		off();
		expect(calls).toEqual([1]);
	});

	test('the age travels, not the server clock', async () => {
		const env = fakeEnv(5_000_000);
		const server = env.client();
		const { q, calls } = counted('aged', 10_000);
		await q.ensure(server, { page: 1 });
		env.sched.advance(6_000);
		const snap = roundTrip(dehydrate(server));
		const skewed = fakeEnv(42);
		const browser = skewed.client();
		hydrate(browser, snap);
		expect(browser.get(q, { page: 1 }).updatedAt).toBe(42 - 6_000);
		calls.length = 0;
		skewed.sched.advance(3_000);
		const off = browser.subscribe(q, { page: 1 }, () => {});
		await settle();
		expect(calls).toEqual([]);
		off();
		skewed.sched.advance(2_000);
		const again = browser.subscribe(q, { page: 1 }, () => {});
		await settle();
		again();
		expect(calls).toEqual([1]);
	});

	test('an invalidated entry stays invalidated', async () => {
		const env = fakeEnv();
		const server = env.client();
		const { q, calls } = counted();
		await q.ensure(server, { page: 1 });
		q.invalidate(server, { page: 1 });
		const browser = env.client();
		hydrate(browser, roundTrip(dehydrate(server)));
		calls.length = 0;
		const off = browser.subscribe(q, { page: 1 }, () => {});
		await settle();
		off();
		expect(calls).toEqual([1]);
	});

	test('an error entry comes back as the error it was', async () => {
		const env = fakeEnv();
		const server = env.client();
		const failing = query<void, string>({
			id: 'failing',
			retry: 0,
			fetch: async () => {
				throw new RivaRequestError('HTTP_502', 'Bad gateway', {
					status: 502,
					retryable: true,
				});
			},
		});
		const plain = query<void, string>({
			id: 'plain',
			retry: 0,
			fetch: async () => {
				throw new RivaError('MY_CODE', 'mine');
			},
		});
		await failing.ensure(server).catch(() => {});
		await plain.ensure(server).catch(() => {});
		const browser = env.client();
		hydrate(browser, roundTrip(dehydrate(server)));
		const a = browser.get(failing).error as RivaRequestError;
		expect(a).toBeInstanceOf(RivaRequestError);
		expect([a.code, a.message, a.status, a.retryable]).toEqual([
			'HTTP_502',
			'',
			502,
			true,
		]);
		const b = browser.get(plain).error as RivaError;
		expect(b).toBeInstanceOf(RivaError);
		expect(b).not.toBeInstanceOf(RivaRequestError);
		expect(b.code).toBe('MY_CODE');
		expect(browser.get(plain).status).toBe('error');
	});

	test.each([
		[
			'RIVA_NETWORK',
			() => new RivaNetworkError('connect ECONNREFUSED 10.0.0.5'),
			RivaNetworkError,
		],
		['HTTP_503', () => new RivaHttpError(503, 'Unavailable'), RivaHttpError],
		['RIVA_ABORT', () => new RivaAbortError(), RivaAbortError],
	])('%s keeps its class, with no message', async (code, make, Class) => {
		const env = fakeEnv();
		const server = env.client();
		const failing = query<void, string>({
			id: `class-${code}`,
			retry: 0,
			fetch: async () => {
				throw make();
			},
		});
		await failing.ensure(server).catch(() => {});
		const wire = roundTrip(dehydrate(server));
		expect(JSON.stringify(wire)).not.toContain('ECONNREFUSED');
		const browser = env.client();
		hydrate(browser, wire);
		const e = browser.get(failing).error as RivaError;
		expect(e).toBeInstanceOf(Class);
		expect(e.code).toBe(code);
		expect(e.message).toBe('');
	});

	test('a snapshot that is not one throws', () => {
		const client = createRivaClient();
		for (const bad of [{}, { v: 2, t: 0, q: [], a: {} }, null, undefined]) {
			expect(() => hydrate(client, bad as never)).toThrow(RivaError);
		}
		expect(() => hydrate(client, { v: 2 } as never)).toThrow(
			'Cannot hydrate: this is not a snapshot dehydrate() made (version 2).',
		);
		try {
			hydrate(client, {} as never);
		} catch (e) {
			expect((e as RivaError).code).toBe('RIVA_SSR');
		}
	});
});

describe('merging into existing entries', () => {
	test('a newer snapshot replaces, an older one is kept out', async () => {
		const env = fakeEnv();
		const { q } = counted('merge');
		const browser = env.client();
		q.setData(browser, { page: 1 }, { n: 10, at: new Date(0) });
		env.sched.advance(1_000);
		const older = env.client();
		q.setData(older, { page: 1 }, { n: 20, at: new Date(0) });
		env.sched.advance(1_000);
		// older was written 1000 ms before now; the browser's entry 2000 ms before.
		hydrate(browser, roundTrip(dehydrate(older)));
		expect(browser.get(q, { page: 1 }).data?.n).toBe(20);
		const stale = roundTrip(dehydrate(older));
		q.setData(browser, { page: 1 }, { n: 30, at: new Date(0) });
		hydrate(browser, stale);
		expect(browser.get(q, { page: 1 }).data?.n).toBe(30);
	});

	test('an entry in flight is left alone', async () => {
		const env = fakeEnv();
		let release!: (v: { n: number; at: Date }) => void;
		const slow = query<{ page: number }, { n: number; at: Date }>({
			id: 'slow',
			fetch: () =>
				new Promise((r) => {
					release = r;
				}),
		});
		const src = env.client();
		slow.setData(src, { page: 1 }, { n: 1, at: new Date(0) });
		const snap = roundTrip(dehydrate(src));
		const browser = env.client();
		const run = slow.ensure(browser, { page: 1 });
		hydrate(browser, snap);
		expect(browser.get(slow, { page: 1 }).status).not.toBe('success');
		release({ n: 2, at: new Date(0) });
		expect((await run).n).toBe(2);
	});

	test('an entry with an optimistic layer is left alone', async () => {
		const env = fakeEnv();
		const { q } = counted('layered');
		const src = env.client();
		q.setData(src, { page: 1 }, { n: 1, at: new Date(0) });
		env.sched.advance(10);
		const browser = env.client();
		q.setData(browser, { page: 1 }, { n: 0, at: new Date(0) });
		browser.queries.lay(q, { page: 1 }, () => ({ n: 99, at: new Date(0) }));
		hydrate(browser, roundTrip(dehydrate(src)));
		expect(browser.get(q, { page: 1 }).data?.n).toBe(99);
		expect(
			dehydrate(browser).q.find((e) => e.k.startsWith('layered'))?.d,
		).toMatchObject({ n: 0 });
	});

	test('deferObserved returns what an observer watches instead of applying it', async () => {
		const env = fakeEnv();
		const { q } = counted('observed');
		const browser = env.client();
		q.setData(browser, { page: 1 }, { n: 1, at: new Date(0) });
		q.setData(browser, { page: 2 }, { n: 2, at: new Date(0) });
		const off = browser.subscribe(q, { page: 1 }, () => {});
		await settle();
		env.sched.advance(100);
		const src = env.client();
		q.setData(src, { page: 1 }, { n: 5, at: new Date(0) });
		q.setData(src, { page: 2 }, { n: 6, at: new Date(0) });
		const deferred = hydrate(browser, roundTrip(dehydrate(src)), {
			deferObserved: true,
		});
		expect(browser.get(q, { page: 2 }).data?.n).toBe(6);
		expect(browser.get(q, { page: 1 }).data?.n).toBe(1);
		expect(deferred?.q.map((e) => e.k)).toEqual(['observed:{"page":1}']);
		expect(hydrate(browser, deferred as never)).toBeUndefined();
		expect(browser.get(q, { page: 1 }).data?.n).toBe(5);
		off();
	});
});

describe('pending entries', () => {
	test('a newer snapshot entry is kept over an older one', async () => {
		const env = fakeEnv();
		const { q } = counted('pend');
		const older = env.client();
		q.setData(older, { page: 1 }, { n: 1, at: new Date(0) });
		env.sched.advance(5_000);
		const newer = env.client();
		q.setData(newer, { page: 1 }, { n: 2, at: new Date(0) });
		const browser = env.client();
		hydrate(browser, roundTrip(dehydrate(newer)));
		hydrate(browser, roundTrip(dehydrate(older)));
		expect(browser.get(q, { page: 1 }).data?.n).toBe(2);
	});
});

describe('signals', () => {
	test('a signal not created yet is seeded, once', () => {
		const env = fakeEnv();
		const server = env.client();
		const draft = signal(
			{ text: '', at: new Date(0) },
			{ name: 'draft', ssr: true },
		);
		server.get(draft);
		server.set(draft, { text: 'hi', at: new Date(7) });
		const snap = roundTrip(dehydrate(server));
		const browser = env.client();
		hydrate(browser, snap);
		expect(browser.get(draft)).toEqual({ text: 'hi', at: new Date(7) });
		browser.set(draft, { text: 'edited', at: new Date(8) });
		hydrate(browser, snap);
		expect(browser.get(draft).text).toBe('edited');
	});

	test('a signal that exists is never overwritten', () => {
		const env = fakeEnv();
		const server = env.client();
		const count = signal(0, { name: 'count', ssr: true });
		server.set(count, 5);
		const snap = roundTrip(dehydrate(server));
		const browser = env.client();
		browser.set(count, 1);
		hydrate(browser, snap);
		expect(browser.get(count)).toBe(1);
	});

	test('a seeded signal is dehydrated again and an ssr: false signal is never seeded', () => {
		const env = fakeEnv();
		const server = env.client();
		const kept = signal(0, { name: 'kept', ssr: true });
		const local = signal(0, { name: 'local', ssr: false });
		server.set(kept, 3);
		const snap = { ...dehydrate(server), a: { kept: 3, local: 9 } };
		const browser = env.client();
		hydrate(browser, snap);
		browser.get(kept);
		expect(browser.get(local)).toBe(0);
		expect(dehydrate(browser).a).toEqual({ kept: 3 });
	});
});

describe('through the cache policies', () => {
	type P = {
		// biome-ignore lint/style/useNamingConvention: GraphQL's field name
		__typename: 'Patient';
		id: string;
		name: string;
		seenAt: Date;
	};
	const ada: P = {
		__typename: 'Patient',
		id: '1',
		name: 'Ada',
		seenAt: new Date('2026-05-06T07:08:09Z'),
	};

	test('entities() round trips and renormalizes, Dates included', async () => {
		const env = fakeEnv();
		const patients = query<void, { patients: P[]; top: P }>({
			id: 'patients',
			cache: entities(),
			fetch: async () => ({ patients: [ada], top: ada }),
		});
		const server = env.client();
		await patients.ensure(server);
		const snap = roundTrip(dehydrate(server));
		expect(JSON.stringify(snap)).not.toContain('"refs"');
		const browser = env.client();
		hydrate(browser, snap);
		const data = browser.get(patients).data;
		expect(data?.patients[0]?.seenAt).toBeInstanceOf(Date);
		expect(data?.patients[0]).toEqual(ada);
		expect(data?.top).toEqual(ada);
		expect(readEntity(browser, 'Patient:1')).toMatchObject({ name: 'Ada' });
	});

	test('with deferObserved nothing observed is written, through shared entities either', async () => {
		const env = fakeEnv();
		const make = (id: string) =>
			query<void, { p: P }>({
				id,
				cache: entities(),
				staleTime: 60_000,
				fetch: async () => ({ p: ada }),
			});
		const one = make('one');
		const two = make('two');
		const server = env.client();
		const renamed = { ...ada, name: 'Grace' };
		one.setData(server, undefined, { p: renamed });
		two.setData(server, undefined, { p: renamed });
		const browser = env.client();
		one.setData(browser, undefined, { p: ada });
		const seen: string[] = [];
		const off = browser.subscribe(one, undefined, (s) =>
			seen.push(s.data?.p.name ?? ''),
		);
		await settle();
		env.sched.advance(100);
		seen.length = 0;
		const deferred = hydrate(browser, roundTrip(dehydrate(server)), {
			deferObserved: true,
		});
		// "Render": the unobserved entry is created, and still nothing is written.
		expect(browser.get(two).status).toBe('idle');
		expect(readEntity(browser, 'Patient:1')).toMatchObject({ name: 'Ada' });
		expect(seen).toEqual([]);
		expect(deferred?.q.map((e) => e.k).sort()).toEqual(['one:', 'two:']);
		hydrate(browser, deferred as never);
		expect(readEntity(browser, 'Patient:1')).toMatchObject({ name: 'Grace' });
		expect(browser.get(two).data?.p.name).toBe('Grace');
		expect(seen.at(-1)).toBe('Grace');
		off();
	});

	test('infinite pages round trip, and fetchNext continues after hydration', async () => {
		const env = fakeEnv();
		const feed = infinite({
			id: 'feed',
			retry: 0,
			staleTime: 60_000,
			fetch: async (v: { after?: string }) => {
				const from = v.after === undefined ? 0 : Number(v.after) + 1;
				const edges = [from, from + 1].map((i) => ({
					node: { id: String(i) },
					cursor: String(i),
				}));
				return {
					c: {
						edges,
						pageInfo: {
							hasNextPage: true,
							hasPreviousPage: false,
							endCursor: String(from + 1),
						},
					},
				};
			},
			connection: (p) => p.c,
		});
		const server = env.client();
		await feed.ensure(server);
		await feed.fetchNext(server);
		const browser = env.client();
		hydrate(browser, roundTrip(dehydrate(server)));
		const s = browser.get(feed);
		expect(s.data?.nodes.map((n) => n.id)).toEqual(['0', '1', '2', '3']);
		expect(s.hasNext).toBe(true);
		await feed.fetchNext(browser);
		expect(browser.get(feed).data?.nodes.map((n) => n.id)).toEqual([
			'0',
			'1',
			'2',
			'3',
			'4',
			'5',
		]);
	});
});

describe('requests stay apart', () => {
	test('two clients never see each other, hydrated or not', async () => {
		const env = fakeEnv();
		const { q } = counted('leak');
		const a = env.client();
		const b = env.client();
		const secret = signal('', { name: 'who', ssr: true });
		q.setData(a, { page: 1 }, { n: 1, at: new Date(0) });
		a.set(secret, 'alice');
		const snapA = roundTrip(dehydrate(a));
		expect(dehydrate(b)).toEqual({
			v: 1,
			t: env.sched.now(),
			q: [],
			a: {},
		} as never);
		hydrate(b, snapA);
		b.set(secret, 'bob');
		expect(a.get(secret)).toBe('alice');
		expect(dehydrate(a).a).toEqual({ who: 'alice' });
		expect(dehydrate(b).a).toEqual({ who: 'bob' });
	});
});
