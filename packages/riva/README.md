# @softistx/riva

Core: signals, RivaClient, query and mutation engine, normalized and keyed cache, pagination, optimistic layer, dehydrate and hydrate. Pure TypeScript, no DOM, no React.

Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md). Errors and fixes: [docs](./docs/README.md).

```sh
bun add @softistx/riva
```

Zero runtime dependencies.

## Signals

Definitions are stateless; values live in a `RivaClient`. On the server, create one per request, so values never leak between requests.

```ts
import { atom, batch, computed, createRivaClient, untracked } from '@softistx/riva';

const count = atom(0);
const double = computed((get) => get(count) * 2); // lazy, cached, tracked dynamically

const client = createRivaClient();
client.subscribe(double, (v) => console.log('double', v));
client.set(count, 2); // logs "double 4"
client.set(count, (n) => n + 1); // logs "double 6"

// Ambient reads: inside client.run, atoms and computeds read through that client.
client.run(() => {
	count.set(10);
	batch(() => { count.set(11); count.set(12); }); // one notification at the end
	untracked(() => count.get()); // read without becoming a dependency
});

// Effects are client-only (a no-op on the server); the returned cleanup runs before each re-run.
client.effect(() => {
	const n = client.get(count);
	return () => console.log('leaving', n);
});
```

- `atom(initial, { name?, equals?, ssr? })`, `computed(fn, { name?, equals? })`: stateless definitions. Subscribers fire only when the value changes (`equals`, default `Object.is`), once per change, never on a half-updated graph.
- `client.get / set / subscribe / effect / run / batch`: the whole API outside any ambient scope.
- `effect(() => …)` (free function) re-runs on the ambient client in a browser and is a no-op on the server; `client.effect` always runs.
- Exported types: `Atom`, `AtomOptions`, `Computed`, `ComputedOptions`, `Readable`, `Getter`, `Listener`, `Unsubscribe`, `EffectFn`.

### Errors

`RivaError` is the base class (with a `code`); all are defined once here so `instanceof` holds.

- `RIVA_SCOPE` (`RivaScopeError`): a read with no client in scope.
- `RIVA_CYCLE`: a computed that reads itself.
- `RIVA_LOOP`: a node re-ran more than 100 times in one flush (for example an effect that keeps writing its own source).
- Listeners and effects that throw never stop the others: every notification runs, then the single error is rethrown as is, and several become an `AggregateError`.

See [troubleshooting](./docs/troubleshooting.md).

### Scope errors

Calling `atom.get()` (or `set`, `subscribe`) with no client in scope throws `RivaScopeError` (`RIVA_SCOPE`): "No RivaClient in scope". Fix it by reading through `client.get(def)` or wrapping the code in `client.run(() => …)`. In a browser you can set one default client with `setDefaultClient(client)`; on the server it throws, since a module-level client would leak between requests. `setDefaultClient(undefined)` clears the default.

## Queries

A query is a stateless definition: an `id`, and a `fetch` that gets typed variables and returns data. The core is transport-agnostic (the GraphQL and REST adapters supply the id and the fetcher); here it is over a plain `fetch`. Cache entries live in the `RivaClient`, keyed by the id and the stable-serialized variables.

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
client.get(user, { id: '1' }); // { status, data, error, isFetching, updatedAt }: a pure read, tracked in a computed or effect
const off = client.subscribe(user, { id: '1' }, (state) => console.log(state.status)); // observes: fetches, polls, refetches on focus

user.prefetch(client, { id: '2' }); // fire and forget, never rejects
user.invalidate(client, { id: '1' }); // stale; refetches when observed. No variables: every entry of the definition
user.setData(client, { id: '1' }, { id: '1', name: 'Ada' }); // success, updatedAt now; a fetch in flight resolves its waiters with it
user.cancel(client, { id: '1' }); // aborts the fetch, restores the previous state
```

- **Status model**: `idle | pending | success | error`, plus `isFetching`. A background refetch keeps `status: 'success'` and the old data with `isFetching: true`; an error keeps the last data.
- **Dedupe**: one in-flight fetch per key; concurrent `ensure` and `subscribe` share it.
- **Options**: `staleTime` (0), `gcTime` (5 min in a browser, `Infinity` on the server: no timers, a per-request client is just dropped), `retry` (3 in a browser, 0 on the server; a count or `(failures, error) => boolean`), `retryDelay` (default `min(1000 * 2 ** failures, 30_000)`), `refetchOnFocus` / `refetchOnReconnect` (true; observed and stale entries only, browser only), `refetchEvery` (polling while observed; browser only, like focus and reconnect: no timer is armed on the server).
- **Abort**: the fetcher gets `signal`. `ensure(client, vars, { signal })` rejects with `RivaAbortError` when the caller aborts; the shared fetch is aborted only when no other waiter or observer remains, and an aborted fetch never writes an error state.
- **Tests and other hosts**: `createRivaClient({ scheduler: { now, setTimeout, clearTimeout }, events: { onFocus, onReconnect } })` replaces the clock, timers and window events.
- Variables are optional at call sites when the fetcher takes none; `Vars` and `Data` are inferred from `fetch`.

### Exported types and helpers

`stableKey(id, vars)` derives the cache key (sorted object keys, `Date` as ISO, `undefined` dropped). Types: `Query`, `QueryOptions`, `QueryState`, `QueryStatus`, `EnsureOptions`, `FetchContext` (`{ signal, client }`), `VarsArgs`, `Duration`, and for the injectable environment `Scheduler` and `ClientEvents`.

### Query errors

Defined once here so adapters throw them and `instanceof` holds.

- `RivaRequestError` (`status?`, `retryable`, `cause`): a failed request. `RivaHttpError(status)` has code `HTTP_<status>` and is retryable for 5xx, 408 and 429; `RivaNetworkError` (`RIVA_NETWORK`) is retryable.
- `RivaAbortError` (`RIVA_ABORT`): never retried.
- Never retried either: a `RivaRequestError` with `retryable: false`. Any other error is retried per `retry`.
- `RIVA_DURATION`: an invalid duration string. `RIVA_KEY`: variables the key cannot serialize (function, symbol, bigint, cycle).

