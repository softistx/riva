import type { FetchContext } from '../query';
import type { Connection, InfiniteData, PageParam } from './types';

export interface Paging<Vars, Page, Node> {
	page: (vars: Vars, p: PageParam, ctx: FetchContext) => Promise<Page>;
	connection: (page: Page) => Connection<Node>;
}

/**
 * Re-runs the loaded pages in order from the first one's cursor, each next
 * cursor coming from the fresh page before it; stops when the list ends or
 * runs out of pages. Nothing is returned until every page has arrived.
 */
export async function refetchAll<Vars, Page, Node>(
	{ page, connection }: Paging<Vars, Page, Node>,
	vars: Vars,
	ctx: FetchContext,
	cur: InfiniteData<Page> | undefined,
): Promise<InfiniteData<Page>> {
	const out: InfiniteData<Page> = { pages: [], params: [] };
	let p: PageParam = cur?.params[0] ?? {};
	for (let i = 0, n = cur?.pages.length || 1; i < n; i++) {
		const next = await page(vars, p, ctx);
		out.pages.push(next);
		out.params.push(p);
		const { hasNextPage, endCursor } = connection(next).pageInfo;
		// A page asked backwards does not say whether more follow it.
		if (endCursor == null || (!hasNextPage && p.before === undefined)) break;
		p = { after: endCursor };
	}
	return out;
}

export type Dir = 'next' | 'previous';

/** The cursor to fetch beyond the loaded pages, or `undefined` at the end. */
export function cursorBeyond<Page, Node>(
	connection: (page: Page) => Connection<Node>,
	data: InfiniteData<Page> | undefined,
	dir: Dir,
): string | undefined {
	const at = dir === 'next' ? data?.pages.at(-1) : data?.pages[0];
	if (at === undefined) return;
	const i = connection(at).pageInfo;
	const cursor = dir === 'next' ? i.endCursor : i.startCursor;
	return (dir === 'next' ? i.hasNextPage : i.hasPreviousPage) && cursor != null
		? cursor
		: undefined;
}
