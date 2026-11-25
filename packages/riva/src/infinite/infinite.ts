import type { RivaClient } from '../client';
import { stableKey } from '../key';
import { type Query, query } from '../query';
import { fetchMore } from './more';
import { cursorBeyond, refetchAll } from './refetch';
import { createSlots, NONE } from './slots';
import type {
	FeedVars,
	Infinite,
	InfiniteData,
	InfiniteList,
	InfiniteOptions,
	PageParam,
} from './types';

/**
 * A cursor-paginated list: a query whose data is the loaded pages. A refetch
 * re-runs them all and swaps them in at once; `fetchNext` and `fetchPrevious`
 * add one page. Nodes flow through the `cache` policy like any query's data.
 */
export function infinite<
	V = void,
	Page = unknown,
	Node = unknown,
	A extends string = 'after',
	B extends string = 'before',
>(
	o: InfiniteOptions<V, Page, Node, A, B>,
): Infinite<FeedVars<V, A | B>, Page, Node> {
	type Vars = FeedVars<V, A | B>;
	const { fetch, connection, cursor, ...rest } = o;
	const names = {
		after: cursor?.after ?? 'after',
		before: cursor?.before ?? 'before',
	};
	const slots = createSlots();
	const lists = new WeakMap<object, InfiniteList<Page, Node>>();
	const page = (vars: Vars, p: PageParam, ctx: Parameters<typeof fetch>[1]) => {
		// The caller never owns the cursor variables: strip them before adding ours.
		const base = { ...(vars as object) } as Record<string, unknown>;
		delete base[names.after];
		delete base[names.before];
		if (p.after !== undefined) base[names.after] = p.after;
		if (p.before !== undefined) base[names.before] = p.before;
		return fetch(base as Parameters<typeof fetch>[0], ctx);
	};
	const withNodes = (d: InfiniteData<Page>): InfiniteList<Page, Node> => ({
		...d,
		nodes: d.pages.flatMap((p) => connection(p).edges.map((e) => e.node)),
	});
	const read = (client: RivaClient, vars: Vars) =>
		client.untracked(() => client.queries.state(q, vars).data);

	const q: Query<Vars, InfiniteData<Page>> = query<Vars, InfiniteData<Page>>({
		...rest,
		fetch: (vars, ctx) =>
			refetchAll({ page, connection }, vars, ctx, read(ctx.client, vars)),
		derive: (client, s, vars) => {
			const data = s.data;
			const list = data && (lists.get(data) ?? withNodes(data));
			if (data && list) lists.set(data, list);
			const [n, p] = client.get(slots.flags)[stableKey(o.id, vars)] ?? NONE;
			return {
				...s,
				data: list,
				hasNext: cursorBeyond(connection, data, 'next') !== undefined,
				hasPrevious: cursorBeyond(connection, data, 'previous') !== undefined,
				isFetchingNext: n,
				isFetchingPrevious: p,
			};
		},
	});
	const more = {
		id: o.id,
		q,
		slots,
		connection,
		page,
		retry: rest.retry,
		retryDelay: rest.retryDelay,
	};

	return Object.freeze({
		...q,
		ensure: (client: RivaClient, ...args: unknown[]) =>
			(q.ensure as (...a: unknown[]) => Promise<unknown>)(client, ...args).then(
				() => read(client, args[0] as Vars),
			),
		cancel(client: RivaClient, vars?: Vars) {
			const key = stableKey(o.id, vars);
			for (const d of ['next', 'previous'])
				slots.slot(client).ctls.get(`${d}:${key}`)?.abort();
			client.queries.cancel(q, vars);
		},
		fetchNext: (client: RivaClient, vars?: Vars) =>
			fetchMore(more, 'next', client, vars as Vars),
		fetchPrevious: (client: RivaClient, vars?: Vars) =>
			fetchMore(more, 'previous', client, vars as Vars),
	}) as unknown as Infinite<Vars, Page, Node>;
}
