# Infinite lists: `@softistx/riva/infinite`

A cursor-paginated list is a query whose data is the pages loaded so far. It reads like any query (`riva.get`, `subscribe`, `ensure`, `invalidate`, `setData`, staleness, `gcTime`, `retry`, `cache`) and adds `fetchNext` and `fetchPrevious`. The default page shape is a Relay connection (`edges[].node`, `pageInfo` with `hasNextPage`, `hasPreviousPage`, `startCursor`, `endCursor`).

```ts
import { createRiva } from '@softistx/riva';
import { entities } from '@softistx/riva/entities';
import { type Connection, infinite } from '@softistx/riva/infinite';

type Patient = { __typename: 'Patient'; id: string; name: string };
type Page = { patients: Connection<Patient> };

const feed = infinite({
	id: 'patientsFeed',
	cache: entities(), // every page is normalized: a node edit shows everywhere
	staleTime: '30s',
	fetch: async (v: { search: string; after?: string }, { signal }): Promise<Page> =>
		(await fetch(`/api/patients?search=${v.search}&after=${v.after ?? ''}`, { signal })).json(),
	connection: (page) => page.patients,
	// cursor: { after: 'cursor' }, // when the variable is not named `after` (and `before`)
});

const riva = createRiva();
await feed.ensure(riva, { search: 'a' }); // the first page
await feed.fetchNext(riva, { search: 'a' }); // appends the next page
await feed.fetchPrevious(riva, { search: 'a' }); // prepends the previous page

const s = riva.get(feed, { search: 'a' });
s.data?.nodes; // every loaded node, flattened (memoized per data)
s.data?.pages; // the pages as fetched
s.hasNext; s.hasPrevious; s.isFetchingNext; s.isFetchingPrevious;
```

## Options

Every `query` option applies (`id`, `staleTime`, `gcTime`, `retry`, `retryDelay`, `refetchOnFocus`, `refetchOnReconnect`, `refetchEvery`, `cache`; see [queries](./queries.md)), plus:

| Option | Default | Effect |
| --- | --- | --- |
| `fetch(vars, ctx)` | required | Gets the caller's variables plus the cursor; returns one page. |
| `connection(page)` | required | Reads `{ edges, pageInfo }` out of a page. |
| `cursor` | `{ after: 'after', before: 'before' }` | Names the cursor variables of `fetch`. Both must be declared in the variables. |

`Page` and `Node` are inferred from `fetch` and `connection`. The caller's variables are those of `fetch` without `after` and `before`; the library adds the cursor and strips a cursor variable the caller passes.

## The state

`InfiniteState` is a `QueryState` with `data` (`{ nodes, pages }`), `hasNext`, `hasPrevious`, `isFetchingNext` and `isFetchingPrevious`.

## How it behaves

- `fetchNext` and `fetchPrevious` return one promise while in flight (deduped), and resolve at once when there is no next or previous page, or no page loaded yet. They use `retry` and `retryDelay`. An error keeps the loaded pages and sets `status: 'error'` and `error`; the next successful page clears it. `cancel` aborts them as well as a refetch.
- A refetch (stale, `invalidate`, focus) re-runs every loaded page in order, from the first page's cursor, taking each next cursor from the fresh page before it, so inserted or removed items never skip or repeat a node. It stops when `hasNextPage` turns false (a list that shrank loads fewer pages) and swaps all pages in as one change; an error or abort keeps the old pages.
- `fetchNext` and `fetchPrevious` wait for a refetch in flight, then read the cursor from the fresh pages. A page that arrives after the list moved under it is not mixed in: it is fetched again from the new cursor. An `invalidate` made meanwhile is kept.
- With `cache: entities()`, nodes are shared with every other query. `writeEntity` and `invalidateEntity` reach the feed like any query.
- Pagination is forward-only for servers that do not take `before`: `hasPrevious` then stays false.

## Writing to a feed

`setData` and `tx.set` on a feed take the stored shape, `{ pages, params }`, where `params[i]` is the cursor page `i` was fetched with (`{}` for the first, `{ after }` going forward, `{ before }` going back); `nodes` and the flags are derived and never stored. An optimistic edit of a node belongs in the entity layer, an added or removed node in `tx.set` on the pages.

Exports: `infinite`; types `Infinite`, `InfiniteOptions`, `InfiniteData`, `InfiniteList`, `InfiniteState`, `Connection`, `Edge`, `PageInfo`, `PageParam`, `Cursors`, `FeedVars`.
