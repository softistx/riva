import { type Atom, atom } from '../atom';
import type { RivaClient } from '../client';
import { RivaAbortError } from '../errors';
import { stableKey } from '../key';
import { type Query, query } from '../query';
import { raceAbort, retryDelay, shouldRetry, sleep } from '../retry';
import { cursorBeyond, type Dir, refetchAll } from './refetch';
import type {
	FeedVars,
	Infinite,
	InfiniteData,
	InfiniteList,
	InfiniteOptions,
	PageParam,
} from './types';

type Flags = readonly [next: boolean, previous: boolean];

interface Slot {
	flags: Map<string, Atom<Flags>>;
	runs: Map<string, Promise<void>>;
	ctls: Map<string, AbortController>;
}

const noop = () => {};

/**
 * A cursor-paginated list: a query whose data is the loaded pages. A refetch
 * re-runs them all and swaps them in at once; `fetchNext` and `fetchPrevious`
 * add one page. Nodes flow through the `cache` policy like any query's data.
 */
export function infinite<V = void, Page = unknown, Node = unknown>(
	o: InfiniteOptions<V, Page, Node>,
): Infinite<FeedVars<V>, Page, Node> {
	type Vars = FeedVars<V>;
	const { fetch, connection, cursor, ...rest } = o;
	const names = {
		after: cursor?.after ?? 'after',
		before: cursor?.before ?? 'before',
	};
	const slots = new WeakMap<RivaClient, Slot>();
	const lists = new WeakMap<object, InfiniteList<Page, Node>>();
	const slot = (client: RivaClient): Slot => {
		const s = slots.get(client) ?? {
			flags: new Map(),
			runs: new Map(),
			ctls: new Map(),
		};
		slots.set(client, s);
		return s;
	};
	const flag = (client: RivaClient, key: string): Atom<Flags> => {
		const { flags } = slot(client);
		const a = flags.get(key) ?? atom<Flags>([false, false]);
		flags.set(key, a);
		return a;
	};
	const page = (vars: Vars, p: PageParam, ctx: Parameters<typeof fetch>[1]) =>
		fetch(
			{
				...vars,
				...(p.after !== undefined && { [names.after]: p.after }),
				...(p.before !== undefined && { [names.before]: p.before }),
			} as Parameters<typeof fetch>[0],
			ctx,
		);
	const withNodes = (d: InfiniteData<Page>): InfiniteList<Page, Node> => ({
		...d,
		nodes: d.pages.flatMap((p) => connection(p).edges.map((e) => e.node)),
	});
	const paging = { page, connection };
	const read = (
		client: RivaClient,
		vars: Vars,
	): InfiniteData<Page> | undefined =>
		client.untracked(() => client.queries.state(q, vars).data);

	const q: Query<Vars, InfiniteData<Page>> = query<Vars, InfiniteData<Page>>({
		...rest,
		fetch: (vars, ctx) => refetchAll(paging, vars, ctx, read(ctx.client, vars)),
		derive: (client, s, vars) => {
			const data = s.data;
			const list = data && (lists.get(data) ?? withNodes(data));
			if (data && list) lists.set(data, list);
			const [n, p] = client.get(flag(client, stableKey(o.id, vars)));
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

	const more =
		(dir: Dir) =>
		(client: RivaClient, vars?: Vars): Promise<void> => {
			const key = stableKey(o.id, vars);
			const s = slot(client);
			const id = `${dir}:${key}`;
			const running = s.runs.get(id);
			if (running) return running;
			const from = read(client, vars as Vars);
			const at = cursorBeyond(connection, from, dir);
			if (at === undefined) return Promise.resolve();
			const ctl = new AbortController();
			const set = (on: boolean) =>
				client.set(
					flag(client, key),
					(f): Flags => (dir === 'next' ? [on, f[1]] : [f[0], on]),
				);
			const param: PageParam = dir === 'next' ? { after: at } : { before: at };
			const attempt = async () => {
				for (let failures = 0; ; ) {
					try {
						return await raceAbort(
							page(vars as Vars, param, { signal: ctl.signal, client }),
							ctl.signal,
						);
					} catch (x) {
						if (ctl.signal.aborted) throw new RivaAbortError();
						if (!shouldRetry(rest.retry, failures, x)) throw x;
						await sleep(
							client.queries.sched,
							retryDelay(rest.retryDelay, failures++),
							ctl.signal,
						);
						if (ctl.signal.aborted) throw new RivaAbortError();
					}
				}
			};
			set(true);
			s.ctls.set(id, ctl);
			const run = attempt()
				.then((next) => {
					// The list moved under the fetch (a refetch, a write): drop the page.
					if (cursorBeyond(connection, read(client, vars as Vars), dir) !== at)
						return;
					q.setData(client, vars as Vars, (d) => {
						const { pages, params } = d ?? from ?? { pages: [], params: [] };
						return dir === 'next'
							? { pages: [...pages, next], params: [...params, param] }
							: { pages: [next, ...pages], params: [param, ...params] };
					});
				})
				.catch((error) => {
					if (!ctl.signal.aborted) client.queries.fail(q, vars, error);
					throw error;
				})
				.finally(() => {
					s.runs.delete(id);
					s.ctls.delete(id);
					set(false);
				});
			s.runs.set(id, run);
			run.catch(noop);
			return run;
		};

	return Object.freeze({
		...q,
		ensure: (client: RivaClient, ...args: unknown[]) =>
			(q.ensure as (...a: unknown[]) => Promise<unknown>)(client, ...args).then(
				() => client.untracked(() => client.queries.state(q, args[0]).data),
			),
		cancel(client: RivaClient, vars?: Vars) {
			const key = stableKey(o.id, vars);
			for (const d of ['next', 'previous'])
				slot(client).ctls.get(`${d}:${key}`)?.abort();
			client.queries.cancel(q, vars);
		},
		fetchNext: more('next'),
		fetchPrevious: more('previous'),
	}) as unknown as Infinite<Vars, Page, Node>;
}
