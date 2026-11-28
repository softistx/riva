# Queries

> Most call sites use the simple API (`riva.graphql`, `riva.rest`, the hooks over them). This page covers the definition, for settings several call sites share: see [Advanced: shared definitions](./shared-definitions.md).

A query is a stateless definition: an `id` and a `fetch` that takes typed variables and returns data. The core is transport-agnostic: the GraphQL and REST adapters supply the id and the fetcher; here it runs over a plain `fetch`. Cache entries live in the `Riva`, keyed by the id and the stable-serialized variables.

```ts
import { createRiva, query, RivaHttpError } from '@softistx/riva';

const user = query({
	id: 'user',
	staleTime: '30s', // "250ms" | "30s" | "5m" | "2h", or a number of ms
	fetch: async (vars: { id: string }, { signal }) => {
		const res = await fetch(`/api/users/${vars.id}`, { signal });
		if (!res.ok) throw new RivaHttpError(res.status);
		return (await res.json()) as { id: string; name: string };
	},
});

const riva = createRiva(); // one per request on the server
const data = await user.ensure(riva, { id: '1' }); // fetch if missing or stale, else the cache
riva.get(user, { id: '1' }); // { status, data, error, isFetching, updatedAt }: a pure read
const off = riva.subscribe(user, { id: '1' }, (state) => console.log(state.status));
```

`Vars` and `Data` are inferred from `fetch`.

A fetch that receives its data in parts (a GraphQL `@defer`, a streamed body) can publish each part with `ctx.onPart(data)` before it resolves. The entry then reads `status: 'success'` with `isFetching: true`, `data` set to the parts so far and `dataState: 'streaming'`; when the fetch resolves, its value replaces the data and `dataState` becomes `'complete'`. A part after an abort, a restart or a cancel is dropped. A fetch that never calls it has no `dataState`. After a failed stream `dataState` is `'complete'` (the stream ended) and `status` is `'error'`: `data` is then the parts that arrived. Variables are optional at call sites when the fetcher takes none.

```ts
const feed = query<void, string[]>({
	id: 'feed',
	fetch: async (_vars, ctx) => {
		const lines: string[] = [];
		for await (const line of readLines(ctx.signal)) {
			lines.push(line);
			ctx.onPart?.([...lines]); // the entry shows the lines so far
		}
		return lines; // replaces the parts, `dataState` becomes 'complete'
	},
});
```


## Reading and driving a query

| Call | What it does |
| --- | --- |
| `def.ensure(riva, vars, { signal?, staleTime? })` | Fetches if missing or stale and awaits; resolves the cache when fresh. A call's `staleTime` wins over the definition's, then `defaults.staleTime`, then 0. |
| `riva.get(def, vars)` | The state: a pure read, tracked in a computed or effect, never fetches. |
| `riva.subscribe(def, vars, listener, { staleTime? })` | Observes: fetches when missing or stale, polls, refetches on focus and reconnect. Returns an unsubscribe. |
| `def.prefetch(riva, vars)` | Fire and forget; never rejects. |
| `def.invalidate(riva, vars?)` | Marks stale; observed entries refetch. Without variables: every entry of the definition. |
| `def.setData(riva, vars, data)` | Writes a success with `updatedAt` now; a fetch in flight resolves its waiters with it. |
| `def.cancel(riva, vars)` | Aborts the fetch and restores the previous state. An observed entry whose data reads `undefined` is fetched again after a cancel. |

## The state

`QueryState<Data>` is `{ status, data, error, isFetching, updatedAt }`.

- `status` is `idle | loading | success | error`.
- A background refetch keeps `status: 'success'` and the old data with `isFetching: true`. An error keeps the last data.
- Data the cache can no longer read (an evicted entity) counts as stale: `ensure` fetches it and an observed entry refetches.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `id` | required | Identifies the definition; ids must be unique. |
| `fetch(vars, { signal, riva })` | required | Returns the data. |
| `staleTime` | `0` | How long data stays fresh. A `Duration`: a number of ms or `"250ms"`, `"30s"`, `"5m"`, `"2h"`. Unset, it takes `createRiva({ defaults: { staleTime } })`. |
| `gcTime` | 5 min in a browser, `Infinity` on the server | How long an unobserved entry is kept. No timers on the server: a per-request riva is just dropped. |
| `retry` | 3 in a browser, 0 on the server | A count, or `(failures, error) => boolean`. |
| `retryDelay` | `min(1000 * 2 ** failures, 30_000)` | `(failures) => ms`. |
| `refetchOnFocus` | `true` | Observed and stale entries only; browser only. |
| `refetchOnReconnect` | `true` | Same. |
| `refetchEvery` | none | Polls while observed; browser only, no timer is armed on the server. |
| `cache` | none (data kept as is) | A `CachePolicy`, such as `entities()` (see [entities](./entities.md)). |

Never retried: `RivaAbortError`, and a `RivaRequestError` with `retryable: false`. Any other error is retried per `retry`.

## Dedupe and abort

- One in-flight fetch per key: concurrent `ensure` and `subscribe` share it.
- The fetcher gets `signal`. `ensure(riva, vars, { signal })` rejects with `RivaAbortError` when the caller aborts (`ensure`'s `staleTime`, call > definition > `defaults` > 0, decides only this call's freshness check); the shared fetch is aborted only when no other waiter or observer remains, and an aborted fetch never writes an error state.
- `riva.subscribe(def, vars, listener, { staleTime })` overrides the definition's `staleTime` for this observer's first fetch decision only, for example to trust data an `ensure` just loaded.

## Tests and other hosts

```ts
const riva = createRiva({
	scheduler: { now, setTimeout, clearTimeout }, // replaces the clock and timers
	events: { onFocus, onReconnect }, // replaces the window events
});
```

## Keys

`stableKey(id, vars)` derives the cache key: sorted object keys, `Date` as ISO, `undefined` dropped. Variables the key cannot serialize (function, symbol, bigint, cycle) throw `RIVA_KEY`. Never write a key by hand.

## Errors

- `RivaRequestError` (`status?`, `retryable`, `cause`): a failed request. `RivaHttpError(status)` has code `HTTP_<status>`, retryable for 5xx, 408 and 429. `RivaNetworkError` (`RIVA_NETWORK`) is retryable. `RivaAbortError` (`RIVA_ABORT`) is never retried.
- `RIVA_DURATION`: an invalid duration string. `RIVA_KEY`: unserializable variables. `RIVA_CACHE`: data the entity cache cannot store.

Exported types: `Query`, `QueryOptions`, `QueryState`, `QueryStatus`, `EnsureOptions`, `SubscribeOptions`, `FetchContext`, `VarsArgs`, `Duration`, `Scheduler`, `RivaEvents`.

## Traps

- With the default `staleTime` of 0, every `ensure` and every new observer refetches. Set a `staleTime` (or `createRiva({ defaults: { staleTime } })` for every query) for data that may be reused. Data hydrated from the server is fresh for 1 s when none is set; set one for a longer window.
- Two definitions with one `id` share a cache entry.
- `invalidate` only refetches at once what is observed; an unobserved entry refetches on its next read.
