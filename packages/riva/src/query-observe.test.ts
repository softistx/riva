import { expect, test } from 'bun:test';
import { createRivaClient } from './client';
import type { ClientEvents, Scheduler } from './env';
import { query } from './query';

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
