import { describe, expect, test } from 'bun:test';
import { createRiva } from '../client';
import { RivaAbortError, RivaHttpError } from '../errors';
import { infinite } from './infinite';

type Vars = { after?: string; before?: string };
type Conn = {
	edges: Array<{ node: string; cursor: string }>;
	pageInfo: {
		hasNextPage: boolean;
		hasPreviousPage: boolean;
		startCursor: string | null;
		endCursor: string | null;
	};
};

/** A versioned server: items are `<ver><i>`; `hold` gates the answers. */
function gated(total = 6, extra: { retry?: number } = {}) {
	const s = {
		ver: 'old',
		calls: [] as Vars[],
		hold: undefined as Promise<void> | undefined,
		holdWhen: (_v: Vars) => true,
		failures: 0,
	};
	const answer = (v: Vars, ver: string): Conn => {
		const from = v.after !== undefined ? Number(v.after) + 1 : 0;
		let to = Math.min(from + 2, total);
		let start = from;
		if (v.before !== undefined) {
			to = Number(v.before);
			start = Math.max(0, to - 2);
		}
		const edges = [];
		for (let i = start; i < to; i++)
			edges.push({ node: `${ver}${i}`, cursor: String(i) });
		return {
			edges,
			pageInfo: {
				hasNextPage: to < total,
				hasPreviousPage: start > 0,
				startCursor: edges[0]?.cursor ?? null,
				endCursor: edges.at(-1)?.cursor ?? null,
			},
		};
	};
	const feed = infinite({
		id: 'gated',
		staleTime: '1h',
		retry: extra.retry ?? 0,
		retryDelay: () => 0,
		fetch: async (v: Vars, { signal }) => {
			s.calls.push({ ...v });
			const ver = s.ver;
			if (s.hold && s.holdWhen(v)) {
				await Promise.race([
					s.hold,
					new Promise((_, rej) =>
						signal.addEventListener('abort', () => rej(new RivaAbortError())),
					),
				]);
			}
			if (s.failures > 0 && v.after !== undefined) {
				s.failures--;
				throw new RivaHttpError(500, 'Server Error');
			}
			return answer(v, ver);
		},
		connection: (p: Conn) => p,
	});
	const gate = () => {
		let open!: () => void;
		s.hold = new Promise<void>((r) => {
			open = r;
		});
		return () => {
			open();
			s.hold = undefined;
		};
	};
	return { s, feed, gate, answer };
}

const tick = () => new Promise((r) => setTimeout(r, 5));
const nodes = (c: ReturnType<typeof createRiva>, f: {}) =>
	(c.get(f as never) as { data?: { nodes: string[] } }).data?.nodes;

describe('fetchNext and a refetch', () => {
	test('a fetchNext started during a refetch waits and appends to the fresh pages', async () => {
		const { s, feed, gate } = gated();
		const c = createRiva();
		await feed.ensure(c);
		await feed.fetchNext(c);
		s.ver = 'new';
		feed.invalidate(c);
		s.holdWhen = (v) => v.after === undefined;
		const open = gate();
		const refetch = feed.ensure(c);
		await tick();
		const next = feed.fetchNext(c);
		open();
		await Promise.all([refetch, next]);
		expect(nodes(c, feed)).toEqual([
			'new0',
			'new1',
			'new2',
			'new3',
			'new4',
			'new5',
		]);
		expect(c.get(feed).isFetching).toBe(false);
	});

	test('no next page after the refetch: fetchNext is a no-op', async () => {
		const { s, feed, gate } = gated(2);
		const c = createRiva();
		await feed.ensure(c);
		s.ver = 'new';
		feed.invalidate(c);
		const open = gate();
		const refetch = feed.ensure(c);
		await tick();
		const next = feed.fetchNext(c);
		open();
		await Promise.all([refetch, next]);
		expect(nodes(c, feed)).toEqual(['new0', 'new1']);
	});

	test('a refetch during a fetchNext: the stale page is refetched, never mixed', async () => {
		const { s, feed, gate } = gated();
		const c = createRiva();
		await feed.ensure(c);
		s.holdWhen = (v) => v.after !== undefined && s.ver === 'old';
		const open = gate();
		const next = feed.fetchNext(c);
		await tick();
		s.ver = 'new';
		feed.invalidate(c);
		await feed.ensure(c);
		expect(nodes(c, feed)).toEqual(['new0', 'new1']);
		open();
		await next;
		expect(nodes(c, feed)).toEqual(['new0', 'new1', 'new2', 'new3']);
	});

	test('an invalidation made with no run in flight survives a fetchNext', async () => {
		const { s, feed } = gated();
		const c = createRiva();
		await feed.ensure(c);
		feed.invalidate(c);
		await feed.fetchNext(c);
		s.ver = 'new';
		await feed.ensure(c);
		expect(nodes(c, feed)).toEqual(['new0', 'new1', 'new2', 'new3']);
	});
});

describe('flags', () => {
	test('the page and the flag reset land in one batch', async () => {
		const { feed } = gated();
		const c = createRiva();
		await feed.ensure(c);
		const seen: Array<[number, boolean]> = [];
		const off = c.subscribe(feed, undefined, (st) =>
			seen.push([st.data?.nodes.length ?? 0, st.isFetchingNext]),
		);
		await feed.fetchNext(c);
		off();
		expect(seen).toContainEqual([4, false]);
		expect(seen).not.toContainEqual([4, true]);
	});

	test('fetchPrevious is deduped', async () => {
		const { s, feed, answer } = gated();
		const c = createRiva();
		feed.setData(c, undefined, {
			pages: [answer({ after: '3' }, 'old')],
			params: [{ after: '3' }],
		});
		const a = feed.fetchPrevious(c);
		const b = feed.fetchPrevious(c);
		expect(a).toBe(b);
		expect(c.get(feed).isFetchingPrevious).toBe(true);
		await a;
		expect(s.calls.filter((x) => x.before !== undefined)).toHaveLength(1);
		expect(c.get(feed).isFetchingPrevious).toBe(false);
	});
});

describe('cancel and retry', () => {
	test('cancel aborts a fetchNext and a fetchPrevious', async () => {
		const { s, feed, gate, answer } = gated();
		const c = createRiva();
		feed.setData(c, undefined, {
			pages: [answer({ after: '1' }, 'old')],
			params: [{ after: '1' }],
		});
		gate();
		const next = feed.fetchNext(c);
		const prev = feed.fetchPrevious(c);
		next.catch(() => {});
		prev.catch(() => {});
		await tick();
		expect(s.calls).toHaveLength(2);
		feed.cancel(c);
		await expect(next).rejects.toBeInstanceOf(RivaAbortError);
		await expect(prev).rejects.toBeInstanceOf(RivaAbortError);
		const st = c.get(feed);
		expect(st.isFetchingNext || st.isFetchingPrevious).toBe(false);
		expect(st.data?.pages).toHaveLength(1);
	});

	test('fetchNext retries a failing page', async () => {
		const { s, feed } = gated(6, { retry: 2 });
		const c = createRiva();
		await feed.ensure(c);
		s.failures = 2;
		await feed.fetchNext(c);
		expect(s.calls.filter((x) => x.after === '1')).toHaveLength(3);
		expect(nodes(c, feed)).toEqual(['old0', 'old1', 'old2', 'old3']);
	});
});

describe('refetch from a first page that has `before`', () => {
	test('one call when the first page is a backwards one', async () => {
		const { s, feed, answer } = gated();
		const c = createRiva();
		feed.setData(c, undefined, {
			pages: [answer({ before: '3' }, 'old')],
			params: [{ before: '3' }],
		});
		feed.invalidate(c);
		s.ver = 'new';
		s.calls.length = 0;
		await feed.ensure(c);
		expect(s.calls).toEqual([{ before: '3' }]);
		expect(nodes(c, feed)).toEqual(['new1', 'new2']);
	});

	test('continues forward from it', async () => {
		const { s, feed, answer } = gated();
		const c = createRiva();
		feed.setData(c, undefined, {
			pages: [answer({ before: '3' }, 'old'), answer({ after: '2' }, 'old')],
			params: [{ before: '3' }, { after: '2' }],
		});
		feed.invalidate(c);
		s.ver = 'new';
		s.calls.length = 0;
		await feed.ensure(c);
		expect(s.calls).toEqual([{ before: '3' }, { after: '2' }]);
		expect(nodes(c, feed)).toEqual(['new1', 'new2', 'new3', 'new4']);
	});
});
