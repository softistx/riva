# Queries

A query is a stateless definition: an `id` and a `fetch` that takes typed variables and returns data. The core is transport-agnostic: the GraphQL and REST adapters supply the id and the fetcher; here it runs over a plain `fetch`. Cache entries live in the `RivaClient`, keyed by the id and the stable-serialized variables.

```ts
import { createRivaClient, query, RivaHttpError } from '@softistx/riva';

const user = query({
	id: 'user',
	staleTime: '30s', // "250ms" | "30s" | "5m" | "2h", or a number of ms
	fetch: async (vars: { id: string }, { signal }) => {
		const res = await fetch(`/api/users/${vars.id}`, { signal });
		if (!res.ok) throw new RivaHttpError(res.status);
		return (await res.json()) as { id: string; name: string };
	},
});

const client = createRivaClient(); // one per request on the server
const data = await user.ensure(client, { id: '1' }); // fetch if missing or stale, else the cache
client.get(user, { id: '1' }); // { status, data, error, isFetching, updatedAt }: a pure read
const off = client.subscribe(user, { id: '1' }, (state) => console.log(state.status));
```

`Vars` and `Data` are inferred from `fetch`. Variables are optional at call sites when the fetcher takes none.

## Reading and driving a query

| Call | What it does |
| --- | --- |
| `def.ensure(client, vars, { signal? })` | Fetches if missing or stale and awaits; resolves the cache when fresh. |
| `client.get(def, vars)` | The state: a pure read, tracked in a computed or effect, never fetches. |
| `client.subscribe(def, vars, listener, { staleTime? })` | Observes: fetches when missing or stale, polls, refetches on focus and reconnect. Returns an unsubscribe. |
| `def.prefetch(client, vars)` | Fire and forget; never rejects. |
| `def.invalidate(client, vars?)` | Marks stale; observed entries refetch. Without variables: every entry of the definition. |
| `def.setData(client, vars, data)` | Writes a success with `updatedAt` now; a fetch in flight resolves its waiters with it. |
| `def.cancel(client, vars)` | Aborts the fetch and restores the previous state. An observed entry whose data reads `undefined` is fetched again after a cancel. |

## The state

`QueryState<Data>` is `{ status, data, error, isFetching, updatedAt }`.

- `status` is `idle | pending | success | error`.
- A background refetch keeps `status: 'success'` and the old data with `isFetching: true`. An error keeps the last data.
- Data the cache can no longer read (an evicted entity) counts as stale: `ensure` fetches it and an observed entry refetches.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `id` | required | Identifies the definition; ids must be unique. |
| `fetch(vars, { signal, client })` | required | Returns the data. |
| `staleTime` | `0` | How long data stays fresh. A `Duration`: a number of ms or `"250ms"`, `"30s"`, `"5m"`, `"2h"`. |
| `gcTime` | 5 min in a browser, `Infinity` on the server | How long an unobserved entry is kept. No timers on the server: a per-request client is just dropped. |
| `retry` | 3 in a browser, 0 on the server | A count, or `(failures, error) => boolean`. |
| `retryDelay` | `min(1000 * 2 ** failures, 30_000)` | `(failures) => ms`. |
| `refetchOnFocus` | `true` | Observed and stale entries only; browser only. |
| `refetchOnReconnect` | `true` | Same. |
| `refetchEvery` | none | Polls while observed; browser only, no timer is armed on the server. |
| `cache` | none (data kept as is) | A `CachePolicy`, such as `entities()` (see [entities](./entities.md)). |

Never retried: `RivaAbortError`, and a `RivaRequestError` with `retryable: false`. Any other error is retried per `retry`.

## Dedupe and abort

- One in-flight fetch per key: concurrent `ensure` and `subscribe` share it.
- The fetcher gets `signal`. `ensure(client, vars, { signal })` rejects with `RivaAbortError` when the caller aborts; the shared fetch is aborted only when no other waiter or observer remains, and an aborted fetch never writes an error state.
- `client.subscribe(def, vars, listener, { staleTime })` overrides the definition's `staleTime` for this observer's first fetch decision only, for example to trust data an `ensure` just loaded.

## Tests and other hosts

```ts
const client = createRivaClient({
	scheduler: { now, setTimeout, clearTimeout }, // replaces the clock and timers
	events: { onFocus, onReconnect }, // replaces the window events
});
```

## Keys

`stableKey(id, vars)` derives the cache key: sorted object keys, `Date` as ISO, `undefined` dropped. Variables the key cannot serialize (function, symbol, bigint, cycle) throw `RIVA_KEY`. Never write a key by hand.

## Errors

- `RivaRequestError` (`status?`, `retryable`, `cause`): a failed request. `RivaHttpError(status)` has code `HTTP_<status>`, retryable for 5xx, 408 and 429. `RivaNetworkError` (`RIVA_NETWORK`) is retryable. `RivaAbortError` (`RIVA_ABORT`) is never retried.
- `RIVA_DURATION`: an invalid duration string. `RIVA_KEY`: unserializable variables. `RIVA_CACHE`: data the entity cache cannot store.

Exported types: `Query`, `QueryOptions`, `QueryState`, `QueryStatus`, `EnsureOptions`, `SubscribeOptions`, `FetchContext`, `VarsArgs`, `Duration`, `Scheduler`, `ClientEvents`.

## Traps

- With the default `staleTime` of 0, every `ensure` and every new observer refetches. Set a `staleTime` for data that may be reused, especially data hydrated from the server.
- Two definitions with one `id` share a cache entry.
- `invalidate` only refetches at once what is observed; an unobserved entry refetches on its next read.
