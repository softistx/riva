import type { RivaClient } from '../client';
import { computed } from '../computed';
import { stableKey } from '../key';
import type { FetchContext, Query } from '../query';
import { raceAbort, withRetry } from '../retry';
import { cursorBeyond, type Dir } from './refetch';
import type { Slots } from './slots';
import type { Connection, InfiniteData, PageParam } from './types';

/** What `fetchMore` needs of a feed definition. */
export interface More<Vars, Page, Node> {
	id: string;
	q: Query<Vars, InfiniteData<Page>>;
	slots: Slots;
	connection: (page: Page) => Connection<Node>;
	page: (vars: Vars, p: PageParam, ctx: FetchContext) => Promise<Page>;
	retry: Parameters<typeof withRetry>[1]['retry'];
	retryDelay: Parameters<typeof withRetry>[1]['retryDelay'];
}

const noop = () => {};

/** Whether the entry is fetching (a refetch of every loaded page, or its first load). */
const busyOf = <V, P, N>(c: More<V, P, N>, client: RivaClient, vars: V) =>
	computed(() => client.queries.state(c.q, vars).isFetching);

/** Waits until the entry's refetch is no longer in flight. */
async function settled(
	client: RivaClient,
	busy: ReturnType<typeof computed<boolean>>,
	signal: AbortSignal,
): Promise<void> {
	while (client.get(busy))
		await raceAbort(
			new Promise<void>((done) => {
				const off = client.subscribe(busy, (b) => {
					if (b) return;
					off();
					done();
				});
			}),
			signal,
		);
}

/** The fetch loop: the page beyond the loaded ones, written only when no refetch runs and the list did not move. */
async function load<V, P, N>(
	c: More<V, P, N>,
	dir: Dir,
	client: RivaClient,
	vars: V,
	key: string,
	signal: AbortSignal,
): Promise<void> {
	const data = () => client.untracked(() => client.queries.state(c.q, vars));
	const busy = busyOf(c, client, vars);
	for (;;) {
		await settled(client, busy, signal);
		const at = cursorBeyond(c.connection, data().data, dir);
		if (at === undefined) return;
		const param: PageParam = dir === 'next' ? { after: at } : { before: at };
		// A refetch that ran meanwhile makes this page older than the list.
		let refetched = false;
		const off = client.subscribe(busy, (b) => {
			refetched ||= b;
		});
		const next = await withRetry(client.queries.sched, c, signal, () =>
			c.page(vars, param, { signal, client }),
		).finally(off);
		await settled(client, busy, signal);
		const now = data();
		if (
			refetched ||
			now.isFetching ||
			cursorBeyond(c.connection, now.data, dir) !== at
		)
			continue; // the list moved under the fetch: start again from its cursor
		const invalid = client.queries.invalid(c.q, vars);
		client.batch(() => {
			c.q.setData(client, vars, (d) => {
				const { pages, params } = d ?? now.data ?? { pages: [], params: [] };
				return dir === 'next'
					? { pages: [...pages, next], params: [...params, param] }
					: { pages: [next, ...pages], params: [param, ...params] };
			});
			c.slots.setFlag(client, key, dir, false);
		});
		if (invalid) c.q.invalidate(client, vars); // an invalidation is never lost
		return;
	}
}

/** Appends or prepends one page. Deduped per client, entry and direction. */
export function fetchMore<V, P, N>(
	c: More<V, P, N>,
	dir: Dir,
	client: RivaClient,
	vars: V,
): Promise<void> {
	const key = stableKey(c.id, vars);
	const s = c.slots.slot(client);
	const id = `${dir}:${key}`;
	const running = s.runs.get(id);
	if (running) return running;
	const st = client.untracked(() => client.queries.state(c.q, vars));
	if (!st.isFetching && cursorBeyond(c.connection, st.data, dir) === undefined)
		return Promise.resolve();
	const ctl = new AbortController();
	c.slots.setFlag(client, key, dir, true);
	s.ctls.set(id, ctl);
	const run = load(c, dir, client, vars, key, ctl.signal)
		.catch((error) => {
			if (!ctl.signal.aborted) client.queries.fail(c.q, vars, error);
			throw error;
		})
		.finally(() => {
			s.runs.delete(id);
			s.ctls.delete(id);
			c.slots.setFlag(client, key, dir, false);
		});
	s.runs.set(id, run);
	run.catch(noop);
	return run;
}
