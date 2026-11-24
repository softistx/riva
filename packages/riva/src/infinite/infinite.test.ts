import { describe, expect, test } from 'bun:test';
import { createRivaClient } from '../client';
import { entities } from '../entities';
import { writeEntity } from '../entities/api';
import { RivaHttpError } from '../errors';
import { mutation } from '../mutation';
import { infinite } from './infinite';
import type { Connection } from './types';

type Item = {
	// biome-ignore lint/style/useNamingConvention: GraphQL's field name
	__typename: 'Patient';
	id: string;
	name: string;
};
type Page = { patients: Connection<Item> };

/** A server of `total` patients (id 0..total-1), cursors are indices. */
function server(total: number, size = 2) {
	const calls: Array<Record<string, unknown>> = [];
	const state = { total, fail: false };
	const fetch = async (v: {
		after?: string;
		before?: string;
		after2?: string;
	}): Promise<Page> => {
		calls.push(v);
		if (state.fail) throw new RivaHttpError(500, 'Server Error');
		let from = v.after !== undefined ? Number(v.after) + 1 : 0;
		let to = from + size;
		if (v.before !== undefined) {
			to = Number(v.before);
			from = Math.max(0, to - size);
		}
		to = Math.min(to, state.total);
		const edges = [];
		for (let i = from; i < to; i++)
			edges.push({
				node: { __typename: 'Patient' as const, id: String(i), name: `P${i}` },
				cursor: String(i),
			});
		return {
			patients: {
				edges,
				pageInfo: {
					hasNextPage: to < state.total,
					hasPreviousPage: from > 0,
					startCursor: edges[0]?.cursor ?? null,
					endCursor: edges.at(-1)?.cursor ?? null,
				},
			},
		};
	};
	return { calls, state, fetch };
}

const feedOf = (s: ReturnType<typeof server>, extra = {}) =>
	infinite({
		id: 'feed',
		fetch: (v: { after?: string; before?: string }) => s.fetch(v),
		connection: (p) => p.patients,
		retry: 0,
		...extra,
	});

const names = (
	c: ReturnType<typeof createRivaClient>,
	f: ReturnType<typeof feedOf>,
) => c.get(f, undefined).data?.nodes.map((n) => n.name);

describe('paging', () => {
	test('first page, fetchNext twice, then fetchPrevious', async () => {
		const s = server(7);
		const f = feedOf(s);
		const c = createRivaClient();
		const first = await f.ensure(c);
		expect(first.nodes.map((n) => n.id)).toEqual(['0', '1']);
		await f.fetchNext(c);
		await f.fetchNext(c);
		const st = c.get(f);
		expect(st.data?.nodes.map((n) => n.id)).toEqual([
			'0',
			'1',
			'2',
			'3',
			'4',
			'5',
		]);
		expect(st.data?.pages).toHaveLength(3);
		expect(st.data?.params).toEqual([{}, { after: '1' }, { after: '3' }]);
		expect(st.hasNext).toBe(true);
		expect(st.hasPrevious).toBe(false);
		expect(s.calls.at(-1)).toEqual({ after: '3' });
	});

	test('fetchPrevious prepends a page before the first', async () => {
		const s = server(7);
		const f = feedOf(s);
		const c = createRivaClient();
		// start in the middle
		f.setData(c, undefined, {
			pages: [(await s.fetch({ after: '2' })) as never],
			params: [{ after: '2' }],
		});
		expect(c.get(f).hasPrevious).toBe(true);
		await f.fetchPrevious(c);
		const st = c.get(f);
		expect(st.data?.nodes.map((n) => n.id)).toEqual(['1', '2', '3', '4']);
		expect(st.data?.params[0]).toEqual({ before: '3' });
		await f.fetchPrevious(c);
		expect(c.get(f).data?.nodes[0]?.id).toBe('0');
		expect(c.get(f).hasPrevious).toBe(false);
	});

	test('hasNext turns false at the end and fetchNext is then a no-op', async () => {
		const s = server(3);
		const f = feedOf(s);
		const c = createRivaClient();
		await f.ensure(c);
		expect(c.get(f).hasNext).toBe(true);
		await f.fetchNext(c);
		expect(c.get(f).hasNext).toBe(false);
		const n = s.calls.length;
		await f.fetchNext(c);
		await f.fetchPrevious(c);
		expect(s.calls.length).toBe(n);
	});

	test('fetchNext before the first page is loaded is a no-op', async () => {
		const s = server(3);
		const f = feedOf(s);
		await f.fetchNext(createRivaClient());
		expect(s.calls).toHaveLength(0);
	});

	test('a concurrent fetchNext is deduped, and isFetchingNext shows', async () => {
		const s = server(7);
		const f = feedOf(s);
		const c = createRivaClient();
		await f.ensure(c);
		const seen: boolean[] = [];
		const off = c.subscribe(f, undefined, (st) => seen.push(st.isFetchingNext));
		const a = f.fetchNext(c);
		const b = f.fetchNext(c);
		expect(c.get(f).isFetchingNext).toBe(true);
		expect(a).toBe(b);
		await a;
		off();
		expect(s.calls.filter((x) => x['after'] === '1')).toHaveLength(1);
		expect(c.get(f).isFetchingNext).toBe(false);
		expect(c.get(f).data?.pages).toHaveLength(2);
		expect(seen).toContain(true);
	});

	test('custom cursor variable names', async () => {
		const calls: unknown[] = [];
		const f = infinite({
			id: 'custom',
			cursor: { after: 'cursor' },
			fetch: async (v: { cursor?: string; size: number }) => {
				calls.push(v);
				return {
					edges: [{ node: v.cursor ?? 'first' }],
					pageInfo: {
						hasNextPage: v.cursor === undefined,
						hasPreviousPage: false,
						endCursor: 'c1',
					},
				};
			},
			connection: (p) => p,
			retry: 0,
		});
		const c = createRivaClient();
		await f.ensure(c, { size: 5 });
		await f.fetchNext(c, { size: 5 });
		expect(calls).toEqual([{ size: 5 }, { size: 5, cursor: 'c1' }]);
		expect(c.get(f, { size: 5 }).data?.nodes).toEqual(['first', 'c1']);
	});
});

describe('refetch', () => {
	test('invalidate re-runs every loaded page from the first one and swaps them at once', async () => {
		const s = server(7);
		const f = feedOf(s, { staleTime: '1h' });
		const c = createRivaClient();
		await f.ensure(c);
		await f.fetchNext(c);
		await f.fetchNext(c);
		s.calls.length = 0;
		const seen: number[] = [];
		const off = c.subscribe(f, undefined, (st) =>
			seen.push(st.data?.pages.length ?? 0),
		);
		s.state.total = 7;
		f.invalidate(c);
		await new Promise((r) => setImmediate(r));
		off();
		expect(s.calls).toEqual([{}, { after: '1' }, { after: '3' }]);
		expect(new Set(seen)).toEqual(new Set([3]));
		expect(c.get(f).data?.pages).toHaveLength(3);
	});

	test('a shifted list is taken from the fresh cursors, with no duplicate', async () => {
		const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
		const calls: unknown[] = [];
		const f = infinite({
			id: 'shift',
			staleTime: '1h',
			retry: 0,
			fetch: async (v: { after?: string }) => {
				calls.push(v);
				const from = v.after === undefined ? 0 : ids.indexOf(v.after) + 1;
				const part = ids.slice(from, from + 2);
				return {
					edges: part.map((node) => ({ node, cursor: node })),
					pageInfo: {
						hasNextPage: from + 2 < ids.length,
						hasPreviousPage: from > 0,
						endCursor: part.at(-1),
					},
				};
			},
			connection: (p) => p,
		});
		const c = createRivaClient();
		await f.ensure(c);
		await f.fetchNext(c);
		expect(c.get(f).data?.nodes).toEqual(['a', 'b', 'c', 'd']);
		ids.unshift('x', 'y'); // new items in front: a stale cursor would skip or repeat
		f.invalidate(c);
		await f.ensure(c);
		expect(c.get(f).data?.nodes).toEqual(['x', 'y', 'a', 'b']);
		expect(c.get(f).data?.params).toEqual([{}, { after: 'y' }]);
	});

	test('a list that shrank stops early when hasNextPage turns false', async () => {
		const s = server(7);
		const f = feedOf(s);
		const c = createRivaClient();
		await f.ensure(c);
		await f.fetchNext(c);
		await f.fetchNext(c);
		s.state.total = 3;
		f.invalidate(c);
		await f.ensure(c);
		const st = c.get(f);
		expect(st.data?.pages).toHaveLength(2);
		expect(st.data?.nodes.map((n) => n.id)).toEqual(['0', '1', '2']);
		expect(st.hasNext).toBe(false);
	});

	test('an error during the refetch keeps the old pages', async () => {
		const s = server(7);
		const f = feedOf(s);
		const c = createRivaClient();
		await f.ensure(c);
		await f.fetchNext(c);
		s.state.fail = true;
		f.invalidate(c);
		await f.ensure(c).catch(() => {});
		const st = c.get(f);
		expect(st.status).toBe('error');
		expect(st.data?.pages).toHaveLength(2);
	});

	test('an abort keeps the old pages', async () => {
		const s = server(7);
		const f = feedOf(s);
		const c = createRivaClient();
		await f.ensure(c);
		f.invalidate(c);
		void f.ensure(c).catch(() => {});
		f.cancel(c);
		expect(c.get(f).data?.pages).toHaveLength(1);
	});
});

describe('errors', () => {
	test('an error during fetchNext keeps the loaded pages and sets the error', async () => {
		const s = server(7);
		const f = feedOf(s);
		const c = createRivaClient();
		await f.ensure(c);
		s.state.fail = true;
		await expect(f.fetchNext(c)).rejects.toBeInstanceOf(RivaHttpError);
		let st = c.get(f);
		expect(st.error).toBeInstanceOf(RivaHttpError);
		expect(st.data?.pages).toHaveLength(1);
		expect(st.isFetchingNext).toBe(false);
		s.state.fail = false;
		await f.fetchNext(c);
		st = c.get(f);
		expect(st.error).toBeUndefined();
		expect(st.status).toBe('success');
		expect(st.data?.pages).toHaveLength(2);
	});

	test('a page that arrives after the list moved is dropped', async () => {
		const s = server(7);
		const f = feedOf(s);
		const c = createRivaClient();
		await f.ensure(c);
		const p = f.fetchNext(c);
		f.setData(c, undefined, {
			pages: [(await s.fetch({ after: '5' })) as never],
			params: [{ after: '5' }],
		});
		await p;
		expect(c.get(f).data?.pages).toHaveLength(1);
		expect(c.get(f).data?.nodes.map((n) => n.id)).toEqual(['6']);
	});
});

describe('lifecycle', () => {
	test('gc drops an unobserved feed', async () => {
		const s = server(7);
		const f = feedOf(s, { gcTime: 1 });
		const c = createRivaClient();
		await f.ensure(c);
		await new Promise((r) => setTimeout(r, 20));
		expect(c.get(f).status).toBe('idle');
	});

	test('two clients do not share pages or in-flight fetches', async () => {
		const s = server(7);
		const f = feedOf(s);
		const a = createRivaClient();
		const b = createRivaClient();
		await f.ensure(a);
		await f.ensure(b);
		await f.fetchNext(a);
		expect(c2(a)).toBe(2);
		expect(c2(b)).toBe(1);
		function c2(c: typeof a) {
			return c.get(f).data?.pages.length;
		}
		expect(f.fetchNext(a)).not.toBe(f.fetchNext(b));
	});

	test('on the server nothing is timed: no gc, no retry', async () => {
		const s = server(7);
		const f = feedOf(s);
		const c = createRivaClient({
			scheduler: {
				now: () => 0,
				setTimeout() {
					throw new Error('timer');
				},
				clearTimeout() {},
			},
		});
		await f.ensure(c);
		await f.fetchNext(c);
		expect(c.get(f).data?.pages).toHaveLength(2);
	});
});

describe('with entities()', () => {
	const cache = entities();
	const patients = (s: ReturnType<typeof server>) =>
		feedOf(s, { cache, staleTime: '1h' });

	test('a node edit through writeEntity shows in the feed', async () => {
		const s = server(7);
		const f = patients(s);
		const c = createRivaClient();
		await f.ensure(c);
		await f.fetchNext(c);
		const seen: Array<string | undefined> = [];
		const off = c.subscribe(f, undefined, (st) =>
			seen.push(st.data?.nodes[3]?.name),
		);
		writeEntity(c, 'Patient:3', { name: 'Zed' });
		off();
		expect(c.get(f).data?.nodes.map((n) => n.name)).toEqual([
			'P0',
			'P1',
			'P2',
			'Zed',
		]);
		expect(seen).toContain('Zed');
		// pages and params are intact
		expect(c.get(f).data?.params).toEqual([{}, { after: '1' }]);
	});

	test('fetchNext normalizes the new page: a refetch elsewhere updates it', async () => {
		const s = server(7);
		const f = patients(s);
		const c = createRivaClient();
		await f.ensure(c);
		await f.fetchNext(c);
		writeEntity(c, 'Patient:2', { name: 'Two' });
		expect(c.get(f).data?.nodes[2]?.name).toBe('Two');
		expect(c.get(f).hasNext).toBe(true);
	});

	test('a mutation tx.set on a feed shows at once and rolls back on failure', async () => {
		const s = server(7);
		const f = patients(s);
		const c = createRivaClient();
		await f.ensure(c);
		const add = mutation<string, string>({
			id: 'add',
			run: async () => {
				throw new RivaHttpError(500, 'Server Error');
			},
			optimistic: (name, tx) =>
				tx.set(f, undefined, (prev) => {
					const first = prev?.pages[0] as Page;
					const page: Page = {
						patients: {
							...first.patients,
							edges: [
								{
									node: { __typename: 'Patient', id: 'new', name },
									cursor: 'x',
								},
								...first.patients.edges,
							],
						},
					};
					return { pages: [page], params: prev?.params ?? [{}] };
				}),
		});
		const run = add.run(c, 'Neo').catch(() => {});
		expect(c.get(f).data?.nodes[0]?.name).toBe('Neo');
		expect(c.get(f).data?.nodes).toHaveLength(3);
		await run;
		expect(c.get(f).data?.nodes.map((n) => n.name)).toEqual(['P0', 'P1']);
	});
});

test('a first fetch that fails leaves an error with no data', async () => {
	const s = server(7);
	s.state.fail = true;
	const f = feedOf(s);
	const c = createRivaClient();
	await f.ensure(c).catch(() => {});
	expect(c.get(f).status).toBe('error');
	expect(c.get(f).data).toBeUndefined();
	expect(names(c, f)).toBeUndefined();
});
