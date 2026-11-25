import type { RivaClient } from '../client';
import type {
	EnsureOptions,
	FetchContext,
	Query,
	QueryOptions,
	QueryState,
	VarsArgs,
} from '../query';

export interface Edge<Node> {
	node: Node;
	cursor?: string | null | undefined;
}

export interface PageInfo {
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	startCursor?: string | null | undefined;
	endCursor?: string | null | undefined;
}

/** The Relay connection shape (edges and pageInfo) a page holds. */
export interface Connection<Node> {
	edges: readonly Edge<Node>[];
	pageInfo: PageInfo;
}

/** The cursor a page was fetched with: none for the first, `after` going forward, `before` going back. */
export interface PageParam {
	after?: string;
	before?: string;
}

/** What an infinite entry stores, and what `setData` and `tx.set` take: the pages and the cursor each was fetched with. */
export interface InfiniteData<Page> {
	pages: Page[];
	params: PageParam[];
}

/** What readers see: the stored data plus the flattened nodes (memoized per data). */
export interface InfiniteList<Page, Node> extends InfiniteData<Page> {
	nodes: Node[];
}

export interface InfiniteState<Page, Node>
	extends QueryState<InfiniteList<Page, Node>> {
	hasNext: boolean;
	hasPrevious: boolean;
	isFetchingNext: boolean;
	isFetchingPrevious: boolean;
}

/** The variables a caller passes: those of `fetch` without the cursor variables `K`, `void` when none are left. */
export type FeedVars<V, K extends string = 'after' | 'before'> = [
	keyof Omit<V, K>,
] extends [never]
	? // biome-ignore lint/suspicious/noConfusingVoidType: no variables is `void`, as for a query
		void
	: Omit<V, K>;

/** The optional cursor variables `fetch` receives. */
export type Cursors<A extends string, B extends string> = {
	[K in A]?: string;
} & { [K in B]?: string };

export interface InfiniteOptions<
	V,
	Page,
	Node,
	A extends string = 'after',
	B extends string = 'before',
> extends Omit<
		QueryOptions<FeedVars<V, A | B>, InfiniteData<Page>>,
		'fetch' | 'derive'
	> {
	/** Fetches one page; the cursor is merged into the variables. */
	fetch: (
		vars: V & Cursors<NoInfer<A>, NoInfer<B>>,
		ctx: FetchContext,
	) => Promise<Page>;
	/** Reads the connection out of a page. */
	connection: (page: Page) => Connection<Node>;
	/** The variables the cursors travel under. Defaults `after` and `before`. */
	cursor?: { after?: A; before?: B };
}

/** A stateless infinite list definition: a query over `{ pages, params }`. */
export interface Infinite<Vars, Page, Node>
	extends Omit<
		Query<Vars, InfiniteData<Page>, InfiniteState<Page, Node>>,
		'ensure'
	> {
	/** Loads the first page when missing or stale (every loaded page when stale). */
	ensure(
		client: RivaClient,
		...args: VarsArgs<Vars, [opts?: EnsureOptions]>
	): Promise<InfiniteList<Page, Node>>;
	/** Appends the page after the last one. Deduped while in flight; a no-op without a next page. */
	fetchNext(client: RivaClient, ...args: VarsArgs<Vars>): Promise<void>;
	/** Prepends the page before the first one. Deduped while in flight; a no-op without a previous page. */
	fetchPrevious(client: RivaClient, ...args: VarsArgs<Vars>): Promise<void>;
}
