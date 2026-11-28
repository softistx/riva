import { expect, test } from 'bun:test';
import { fakeEnv } from '../test/ssr';
import { createRiva } from './client';
import { query } from './query';
import { entryOf, put } from './query-entry';
import { FRESH_FLOOR_MS, stale } from './query-fresh';

function setup(staleTime?: number, defaults?: { staleTime: number }) {
	const env = fakeEnv();
	const riva = createRiva({
		scheduler: env.sched,
		...(defaults && { defaults }),
	});
	const c = riva.queries.ctx;
	const q = query<number, string>({
		id: 'q',
		fetch: async () => 'x',
		...(staleTime !== undefined && { staleTime }),
	});
	const e = entryOf(c, q, 1);
	return { c, e, tick: env.sched.advance };
}

test('stale: idle, invalidated and aged entries are stale; a fresh success is not', () => {
	const { c, e, tick } = setup(100);
	expect(stale(c, e)).toBe(true);
	put(c, e, { status: 'success', updatedAt: 1_000_000 });
	expect(stale(c, e)).toBe(false);
	tick(100);
	expect(stale(c, e)).toBe(true);
	put(c, e, { updatedAt: 1_000_100 });
	e.invalidated = true;
	expect(stale(c, e)).toBe(true);
});

test('stale: a call staleTime replaces the definition and default', () => {
	const { c, e } = setup(0);
	put(c, e, { status: 'success', updatedAt: 1_000_000 });
	expect(stale(c, e)).toBe(true);
	expect(stale(c, e, 50)).toBe(false);
});

test('stale: minFresh raises a short staleTime and covers an unset one', () => {
	const { c, e, tick } = setup(0);
	put(c, e, { status: 'success', updatedAt: 1_000_000 });
	expect(stale(c, e, undefined, FRESH_FLOOR_MS)).toBe(false);
	tick(FRESH_FLOOR_MS);
	expect(stale(c, e, undefined, FRESH_FLOOR_MS)).toBe(true);
	const u = setup();
	put(u.c, u.e, { status: 'success', updatedAt: 1_000_000 });
	expect(stale(u.c, u.e, undefined, FRESH_FLOOR_MS)).toBe(false);
	expect(stale(u.c, u.e)).toBe(true);
});

test('stale: a seeded entry is fresh for the floor only when nothing sets a staleTime', () => {
	const { c, e, tick } = setup();
	put(c, e, { status: 'success', updatedAt: 1_000_000 - 30_000 });
	e.seeded = { u: 1_000_000 - 30_000, t: 1_000_000 };
	expect(stale(c, e)).toBe(false);
	tick(FRESH_FLOOR_MS);
	expect(stale(c, e)).toBe(true);
	const d = setup(undefined, { staleTime: 0 });
	put(d.c, d.e, { status: 'success', updatedAt: 1_000_000 });
	d.e.seeded = { u: 1_000_000, t: 1_000_000 };
	expect(stale(d.c, d.e)).toBe(true);
});
