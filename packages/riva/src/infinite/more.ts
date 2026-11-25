import type { Riva } from '../client';
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
const busyOf = <V, P, N>(c: More<V, P, N>, riva: Riva, vars: V) =>
	computed(() => riva.queries.state(c.q, vars).isFetching);

/** Waits until the entry's refetch is no longer in flight. */
async function settled(
	riva: Riva,
	busy: ReturnType<typeof computed<boolean>>,
	signal: AbortSignal,
): Promise<void> {
	while (riva.get(busy))
		await raceAbort(
			new Promise<void>((done) => {
				const off = riva.subscribe(busy, (b) => {
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
	riva: Riva,
	vars: V,
	key: string,
	signal: AbortSignal,
): Promise<void> {
	const data = () => riva.untracked(() => riva.queries.state(c.q, vars));
	const busy = busyOf(c, riva, vars);
	for (;;) {
		await settled(riva, busy, signal);
		const at = cursorBeyond(c.connection, data().data, dir);
		if (at === undefined) return;
		const param: PageParam = dir === 'next' ? { after: at } : { before: at };
		// A refetch that ran meanwhile makes this page older than the list.
		let refetched = false;
		const off = riva.subscribe(busy, (b) => {
			refetched ||= b;
		});
		const next = await withRetry(riva.queries.sched, c, signal, () =>
			c.page(vars, param, { signal, riva }),
		).finally(off);
		await settled(riva, busy, signal);
		const now = data();
		if (
			refetched ||
			now.isFetching ||
			cursorBeyond(c.connection, now.data, dir) !== at
		)
			continue; // the list moved under the fetch: start again from its cursor
		const invalid = riva.queries.invalid(c.q, vars);
		riva.batch(() => {
			c.q.setData(riva, vars, (d) => {
				const { pages, params } = d ?? now.data ?? { pages: [], params: [] };
				return dir === 'next'
					? { pages: [...pages, next], params: [...params, param] }
					: { pages: [next, ...pages], params: [param, ...params] };
			});
			c.slots.setFlag(riva, key, dir, false);
		});
		if (invalid) c.q.invalidate(riva, vars); // an invalidation is never lost
		return;
	}
}

/** Appends or prepends one page. Deduped per riva, entry and direction. */
export function fetchMore<V, P, N>(
	c: More<V, P, N>,
	dir: Dir,
	riva: Riva,
	vars: V,
): Promise<void> {
	const key = stableKey(c.id, vars);
	const s = c.slots.slot(riva);
	const id = `${dir}:${key}`;
	const running = s.runs.get(id);
	if (running) return running;
	const st = riva.untracked(() => riva.queries.state(c.q, vars));
	if (!st.isFetching && cursorBeyond(c.connection, st.data, dir) === undefined)
		return Promise.resolve();
	const ctl = new AbortController();
	c.slots.setFlag(riva, key, dir, true);
	s.ctls.set(id, ctl);
	const run = load(c, dir, riva, vars, key, ctl.signal)
		.catch((error) => {
			if (!ctl.signal.aborted) riva.queries.fail(c.q, vars, error);
			throw error;
		})
		.finally(() => {
			s.runs.delete(id);
			s.ctls.delete(id);
			c.slots.setFlag(riva, key, dir, false);
		});
	s.runs.set(id, run);
	run.catch(noop);
	return run;
}
