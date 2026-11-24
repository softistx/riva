import { expect, test } from 'bun:test';
import { createRivaClient } from './client';
import type { Scheduler } from './env';
import { type CachePolicy, query } from './query';
import { armGc, type Ctx, entryOf, peek, put, stale } from './query-entry';

function setup(gcTime?: number) {
	let t = 1000;
	const timers: { fn: () => void; ms: number }[] = [];
	const sched: Scheduler = {
		now: () => t,
		setTimeout: (fn, ms) => {
			const h = { fn, ms };
			timers.push(h);
			return h;
		},
		clearTimeout: (h) => {
			const i = timers.indexOf(h as (typeof timers)[number]);
			if (i >= 0) timers.splice(i, 1);
		},
	};
	const client = createRivaClient();
	const c: Ctx = {
		client,
		sched,
		events: { onFocus: () => () => {}, onReconnect: () => () => {} },
		entries: new Map(),
		observed: 0,
		detach: undefined,
	};
	const q = query<number, string>({
		id: 'q',
		fetch: async () => 'x',
		staleTime: 100,
		...(gcTime === undefined ? {} : { gcTime }),
	});
	return {
		c,
		q,
		timers,
		tick: (ms: number) => {
			t += ms;
		},
	};
}

test('entryOf creates one idle entry per key and reuses it', () => {
	const { c, q } = setup(50);
	const a = entryOf(c, q, 1);
	expect(entryOf(c, q, 1)).toBe(a);
	expect(entryOf(c, q, 2)).not.toBe(a);
	expect(peek(c, a).status).toBe('idle');
});

test('put merges a patch over the current state', () => {
	const { c, q } = setup();
	const e = entryOf(c, q, 1);
	put(c, e, { status: 'success', data: 'x', updatedAt: 1000 });
	put(c, e, { isFetching: true });
	expect(peek(c, e)).toMatchObject({
		status: 'success',
		data: 'x',
		isFetching: true,
	});
});

test('stale: idle, invalidated and aged entries are stale; a fresh success is not', () => {
	const { c, q, tick } = setup();
	const e = entryOf(c, q, 1);
	expect(stale(c, e)).toBe(true);
	put(c, e, { status: 'success', updatedAt: 1000 });
	expect(stale(c, e)).toBe(false);
	tick(100);
	expect(stale(c, e)).toBe(true);
	put(c, e, { updatedAt: 1100 });
	e.invalidated = true;
	expect(stale(c, e)).toBe(true);
});

test('armGc removes an unobserved entry after gcTime, but not while observed', () => {
	const { c, q, timers } = setup(50);
	const e = entryOf(c, q, 1);
	expect(timers.length).toBe(1);
	e.observers = 1;
	armGc(c, e);
	expect(timers.length).toBe(0);
	e.observers = 0;
	armGc(c, e);
	timers[0]?.fn();
	expect(c.entries.size).toBe(0);
});

test('armGc arms no timer when gcTime is Infinity', () => {
	const { c, q, timers } = setup(Infinity);
	entryOf(c, q, 1);
	expect(timers.length).toBe(0);
});

test('a cache policy stores, reads (tracked) and releases the entry data', async () => {
	const log: string[] = [];
	const cache: CachePolicy<{ boxed: number }> = {
		write: (_c, data) => {
			log.push(`write ${data}`);
			return { boxed: data as number };
		},
		read: (_c, s) => s.boxed * 10,
		release: (_c, s) => void log.push(`release ${s.boxed}`),
	};
	let n = 0;
	const q = query<void, number>({ id: 'p', cache, fetch: async () => ++n });
	const client = createRivaClient();
	expect(await q.ensure(client)).toBe(10);
	expect(client.get(q).data).toBe(10);
	q.invalidate(client);
	await q.ensure(client);
	q.setData(client, undefined, (prev) => (prev ?? 0) / 10 + 5);
	expect(client.get(q).data).toBe(70);
	expect(log).toEqual([
		'write 1',
		'write 2',
		'release 1',
		'write 7',
		'release 2',
	]);
});
