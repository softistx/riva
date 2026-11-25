import { expect, test } from 'bun:test';
import { createRiva } from '../client';
import { cursorBeyond, refetchAll } from './refetch';
import type { Connection, PageParam } from './types';

type P = Connection<string> & { tag?: string };
const conn = (
	nodes: string[],
	info: Partial<Connection<string>['pageInfo']> = {},
): P => ({
	edges: nodes.map((node) => ({ node })),
	pageInfo: {
		hasNextPage: false,
		hasPreviousPage: false,
		startCursor: nodes[0] ?? null,
		endCursor: nodes.at(-1) ?? null,
		...info,
	},
});
const ctx = () => ({
	signal: new AbortController().signal,
	riva: createRiva(),
});

test('cursorBeyond reads the end cursor forward and the start cursor back', () => {
	const d = {
		pages: [conn(['a', 'b'], { hasNextPage: true, hasPreviousPage: true })],
		params: [{}],
	};
	expect(cursorBeyond((p: P) => p, d, 'next')).toBe('b');
	expect(cursorBeyond((p: P) => p, d, 'previous')).toBe('a');
	expect(cursorBeyond((p: P) => p, undefined, 'next')).toBeUndefined();
	const end = { pages: [conn(['a'])], params: [{}] };
	expect(cursorBeyond((p: P) => p, end, 'next')).toBeUndefined();
	const nocursor = {
		pages: [conn([], { hasNextPage: true })],
		params: [{}],
	};
	expect(cursorBeyond((p: P) => p, nocursor, 'next')).toBeUndefined();
});

test('refetchAll with nothing loaded fetches the first page only', async () => {
	const seen: PageParam[] = [];
	const out = await refetchAll(
		{
			page: async (_: undefined, p: PageParam) => {
				seen.push(p);
				return conn(['a']);
			},
			connection: (p: P) => p,
		},
		undefined,
		ctx(),
		undefined,
	);
	expect(seen).toEqual([{}]);
	expect(out.params).toEqual([{}]);
});

test('refetchAll starts from the first cursor and follows the fresh ones', async () => {
	const seen: PageParam[] = [];
	const out = await refetchAll(
		{
			page: async (_: undefined, p: PageParam) => {
				seen.push(p);
				return conn(['n'], { hasNextPage: true, endCursor: `e${seen.length}` });
			},
			connection: (p: P) => p,
		},
		undefined,
		ctx(),
		{
			pages: [conn(['a']), conn(['b']), conn(['c'])],
			params: [{ before: 'z' }, { after: 'old1' }, { after: 'old2' }],
		},
	);
	expect(seen).toEqual([{ before: 'z' }, { after: 'e1' }, { after: 'e2' }]);
	expect(out.pages).toHaveLength(3);
});

test('refetchAll stops when the list ends, but not after a page asked backwards', async () => {
	let n = 0;
	const paging = {
		page: async () => conn(['x'], { hasNextPage: ++n > 1 }),
		connection: (p: P) => p,
	};
	const three = {
		pages: [conn(['a']), conn(['b']), conn(['c'])],
		params: [{}, { after: 'a' }, { after: 'b' }],
	};
	// first page: no next -> stops at one page
	n = 0;
	expect(
		(await refetchAll(paging, undefined, ctx(), three)).pages,
	).toHaveLength(1);
	// a page fetched backwards says nothing about what follows it
	n = 0;
	const back = {
		...three,
		params: [{ before: 'q' }, ...three.params.slice(1)],
	};
	expect((await refetchAll(paging, undefined, ctx(), back)).pages).toHaveLength(
		3,
	);
});

test('refetchAll rejects with nothing returned when a page fails', async () => {
	let n = 0;
	const run = refetchAll(
		{
			page: async () => {
				if (++n === 2) throw new Error('boom');
				return conn(['x'], { hasNextPage: true });
			},
			connection: (p: P) => p,
		},
		undefined,
		ctx(),
		{ pages: [conn(['a']), conn(['b'])], params: [{}, { after: 'a' }] },
	);
	await expect(run).rejects.toThrow('boom');
});
