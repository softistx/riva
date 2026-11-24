import { expectTypeOf, test } from 'bun:test';
import type { RivaClient } from '../client';
import { createRivaClient } from '../client';
import { mutation } from '../mutation';
import { infinite } from './infinite';
import type {
	Connection,
	InfiniteData,
	InfiniteList,
	InfiniteState,
} from './types';

type Node = { id: string; name: string };
type Page = { patients: Connection<Node>; total: number };

const feed = infinite({
	id: 't',
	fetch: async (_v: { search: string; after?: string }): Promise<Page> => {
		throw new Error('unused');
	},
	connection: (p) => p.patients,
});

test('Page and Node are inferred from fetch and connection', () => {
	const c = createRivaClient();
	const st = c.get(feed, { search: 'a' });
	expectTypeOf(st).toEqualTypeOf<InfiniteState<Page, Node>>();
	expectTypeOf(st.data?.nodes).toEqualTypeOf<Node[] | undefined>();
	expectTypeOf(st.data?.pages).toEqualTypeOf<Page[] | undefined>();
	expectTypeOf(st.hasNext).toBeBoolean();
	expectTypeOf(st.isFetchingPrevious).toBeBoolean();
});

test('the cursor variables are not asked from the caller', () => {
	expectTypeOf(feed.fetchNext).parameters.toEqualTypeOf<
		[RivaClient, { search: string }]
	>();
	expectTypeOf(feed.ensure).returns.toEqualTypeOf<
		Promise<InfiniteList<Page, Node>>
	>();
	expectTypeOf<Parameters<typeof feed.setData>[2]>().toEqualTypeOf<
		| InfiniteData<Page>
		| ((prev: InfiniteData<Page> | undefined) => InfiniteData<Page>)
	>();
});

test('a feed with no variables takes none', () => {
	const bare = infinite({
		id: 'bare',
		fetch: async (_v: { after?: string }): Promise<Page> => {
			throw new Error('unused');
		},
		connection: (p) => p.patients,
	});
	// biome-ignore lint/suspicious/noConfusingVoidType: no variables is `void`
	expectTypeOf(bare.fetchNext).parameters.toEqualTypeOf<[RivaClient, void?]>();
});

test('a feed is a query for mutations', () => {
	mutation<string, void>({
		id: 'm',
		run: async () => {},
		optimistic: (_n, tx) =>
			tx.set(
				feed,
				{ search: 'a' },
				(prev) => prev ?? { pages: [], params: [] },
			),
	});
});

test('the subscribe listener gets the feed state', () => {
	createRivaClient().subscribe(feed, { search: 'a' }, (s) => {
		expectTypeOf(s.isFetchingNext).toBeBoolean();
	});
});

test('custom cursor names leave the caller variables', () => {
	const custom = infinite({
		id: 'custom',
		cursor: { after: 'afterId', before: 'beforeId' },
		fetch: async (v: { search: string; afterId?: string; beforeId?: string }) =>
			({
				edges: [],
				pageInfo: { hasNextPage: false, hasPreviousPage: false },
			}) as {
				edges: never[];
				pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean };
			} & { v?: typeof v },
		connection: (p) => p,
	});
	const c = createRivaClient();
	void custom.ensure(c, { search: 'a' });
	// @ts-expect-error a cursor variable is not the caller's
	void custom.ensure(c, { search: 'a', afterId: 'x' });
});
