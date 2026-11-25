import { expect, test } from 'bun:test';
import { signal } from './signal';
import { createRivaClient } from './client';
import type { ClientEvents, Scheduler } from './env';
import type { RivaError } from './errors';
import { mutation } from './mutation';
import { type CachePolicy, query } from './query';

const flush = () => new Promise<void>((r) => setImmediate(r));

function env() {
	const timers = new Map<number, () => void>();
	let id = 0;
	const sched: Scheduler = {
		now: () => 1000,
		setTimeout: (fn) => {
			timers.set(++id, fn);
			return id;
		},
		clearTimeout: (h) => void timers.delete(h as number),
	};
	let focus: (() => void) | undefined;
	let attached = 0;
	const events: ClientEvents = {
		onFocus: (cb) => {
			focus = cb;
			attached++;
			return () => {
				focus = undefined;
				attached--;
			};
		},
		onReconnect: () => () => {},
	};
	return {
		client: createRivaClient({ scheduler: sched, events }),
		timers,
		fireFocus: () => focus?.(),
		attached: () => attached,
	};
}

test('the first observer attaches the window events and the last detaches them', () => {
	const { client, attached } = env();
	const q = query<void, string>({ id: 'q', fetch: async () => 'x' });
	const a = client.subscribe(q, () => {});
	const b = client.subscribe(q, () => {});
	expect(attached()).toBe(1);
	a();
	expect(attached()).toBe(1);
	b();
	expect(attached()).toBe(0);
});

test('unsubscribe is idempotent', () => {
	const { client, attached } = env();
	const q = query<void, string>({ id: 'q', fetch: async () => 'x' });
	const a = client.subscribe(q, () => {});
	a();
	a();
	expect(attached()).toBe(0);
});

test('polling runs while observed and stops with the last observer', async () => {
	(globalThis as { document?: unknown }).document = {};
	try {
		const { client, timers } = env();
		let calls = 0;
		const q = query<void, number>({
			id: 'q',
			fetch: async () => ++calls,
			refetchEvery: 10,
			gcTime: Infinity,
			staleTime: 0,
		});
		const off = client.subscribe(q, () => {});
		await flush();
		expect(timers.size).toBeGreaterThan(0);
		for (const [h, fn] of [...timers]) {
			timers.delete(h);
			fn();
		}
		await flush();
		expect(calls).toBe(2);
		off();
		expect(timers.size).toBe(0);
	} finally {
		delete (globalThis as { document?: unknown }).document;
	}
});

test('focus refetches a stale observed entry, unless it opted out', async () => {
	const { client, fireFocus } = env();
	let calls = 0;
	const q = query<void, number>({
		id: 'q',
		fetch: async () => ++calls,
		refetchOnFocus: false,
	});
	const off = client.subscribe(q, () => {});
	await flush();
	fireFocus();
	await flush();
	expect(calls).toBe(1);
	off();
});

test('a subscribe staleTime overrides the first fetch decision only', async () => {
	let calls = 0;
	const q = query<void, number>({
		id: 'observe/stale-override',
		retry: 0,
		fetch: async () => ++calls,
	});
	const a = createRivaClient();
	await q.ensure(a);
	const off = a.subscribe(q, undefined, () => {}, { staleTime: 1000 });
	await flush();
	expect(calls).toBe(1);
	off();
	// A later invalidation still refetches an observed entry.
	const off2 = a.subscribe(q, undefined, () => {}, { staleTime: 1000 });
	q.invalidate(a);
	await flush();
	expect(calls).toBe(2);
	off2();
	const b = createRivaClient();
	await q.ensure(b);
	expect(calls).toBe(3);
	const off3 = b.subscribe(q, undefined, () => {});
	await flush();
	expect(calls).toBe(4);
	off3();
});

const INCOMPLETE = "The cache cannot read the query's data after a fetch.";

/** A policy that reads `undefined` while `holes` is set (an evicted entity, a missing field). */
function holey(initial = false) {
	let leaveHole = initial;
	const holes = signal(false);
	const cache: CachePolicy<unknown> = {
		write: (_c, data) => data,
		read: (c, stored) => (c.get(holes) ? undefined : stored),
		release: () => {},
	};
	let calls = 0;
	const client = createRivaClient();
	const q = query<void, unknown>({
		id: 'miss',
		cache,
		fetch: async () => {
			calls++;
			client.set(holes, leaveHole);
			return { n: calls };
		},
	});
	return {
		q,
		client,
		holes,
		calls: () => calls,
		leave: (v: boolean) => {
			leaveHole = v;
		},
	};
}

test('an observed query whose stored data can no longer be read is refetched, each time', async () => {
	const { q, client, holes, calls } = holey();
	const off = client.subscribe(q, () => {});
	await flush();
	expect(calls()).toBe(1);
	client.set(holes, true);
	await flush();
	expect(calls()).toBe(2);
	expect(client.get(q)).toMatchObject({ status: 'success', data: { n: 2 } });
	client.set(holes, true);
	await flush();
	expect(calls()).toBe(3);
	expect(client.get(q).data).toEqual({ n: 3 });
	off();
});

test('a fetch the cache cannot read ends in RIVA_CACHE and is not retried', async () => {
	const { q, client, calls } = holey(true);
	const seen: string[] = [];
	const a = client.subscribe(q, (s) => seen.push(s.status));
	const b = client.subscribe(q, () => {});
	await flush();
	await flush();
	expect(calls()).toBe(1);
	const state = client.get(q);
	expect(state.status).toBe('error');
	expect((state.error as RivaError).code).toBe('RIVA_CACHE');
	expect((state.error as RivaError).message).toBe(INCOMPLETE);
	expect(seen.filter((x) => x === 'error')).toHaveLength(1);
	a();
	b();
});

test('a refetch after an eviction that stays unreadable errors once, without looping', async () => {
	const { q, client, holes, calls, leave } = holey();
	const off = client.subscribe(q, () => {});
	await flush();
	leave(true);
	client.set(holes, true);
	await flush();
	await flush();
	expect(calls()).toBe(2);
	expect(client.get(q).status).toBe('error');
	off();
});

test('the error clears when the data reads again', async () => {
	const { q, client, holes } = holey(true);
	const off = client.subscribe(q, () => {});
	await flush();
	expect(client.get(q).status).toBe('error');
	client.set(holes, false);
	await flush();
	expect(client.get(q)).toMatchObject({ status: 'success', error: undefined });
	off();
});

test('an optimistic layer that hides the data starts no fetch and sets no error', async () => {
	const { q, client, calls } = holey();
	const off = client.subscribe(q, () => {});
	await flush();
	let release!: (v: string) => void;
	const m = mutation<void, string>({
		id: 'hide',
		run: () => new Promise<string>((r) => (release = r)),
		optimistic: (_v, tx) => tx.set(q, undefined, () => undefined as never),
	});
	const run = m.run(client);
	await flush();
	expect(client.get(q).data).toBeUndefined();
	expect(client.get(q).status).toBe('success');
	expect(calls()).toBe(1);
	release('ok');
	await run;
	off();
});

test('ensure refetches after an eviction instead of resolving nothing', async () => {
	const { q, client, holes, calls } = holey();
	await q.ensure(client);
	client.set(holes, true);
	await expect(q.ensure(client)).resolves.toEqual({ n: 2 });
	expect(calls()).toBe(2);
});

test('ensure rejects with RIVA_CACHE when the fetched data cannot be read', async () => {
	const { q, client } = holey(true);
	const err = (await q.ensure(client).catch((x) => x)) as RivaError;
	expect(err.code).toBe('RIVA_CACHE');
	expect(err.message).toBe(INCOMPLETE);
});
