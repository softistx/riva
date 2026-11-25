# Troubleshooting

Each entry is headed by the message you will see.

## No RivaClient in scope

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** `signal.get()`, `.set()`, `.subscribe()` or `computed.get()` ran outside any client, on the server or in a browser with no default client.

**Why:** definitions are stateless and hold no value; values live in a `RivaClient`. A module-level client on the server would leak between requests, so none is assumed.

**Fix:** read through the client, or run the code inside it.

```ts
const client = createRivaClient(); // one per request on the server
client.get(count);
client.run(() => count.get());
```

## setDefaultClient is browser-only

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** `setDefaultClient(client)` ran where there is no `document`, that is on the server.

**Why:** a default client is module-level state; shared between requests it would mix one user's values into another's.

**Fix:** call it only in browser code. On the server, use the per-request client with `client.run(() => …)`. `setDefaultClient(undefined)` clears the default in a browser.

```ts
if (typeof document !== 'undefined') setDefaultClient(createRivaClient());
```

## Cycle detected

Code: `RIVA_CYCLE`.

**When:** a computed reads itself, directly or through other computeds.

**Why:** its value would depend on itself and can never settle.

**Fix:** break the loop: derive from signals, or move one side to a signal you set explicitly. Name computeds (`computed(fn, { name })`) so the message names the culprit.

```ts
const total = computed((get) => get(price) * get(quantity)); // not get(total)
```

## Loop detected

Code: `RIVA_LOOP`.

**When:** a node re-ran more than 100 times in one flush, typically an effect or subscriber that writes a source it reads.

**Why:** each write re-triggers the node, so the flush never ends. The loop is cut and the error is thrown after the other notifications ran.

**Fix:** make the write converge (guard it with a condition), write to a different signal, or read the source with `untracked`. Name the node with `{ name }` to find it.

```ts
client.effect(() => {
	const n = client.get(count);
	if (n < 5) client.set(count, n + 1); // converges
});
```

## RIVA_STORE

Code: `RIVA_STORE`. Thrown by `@softistx/riva/store` and `useStore`. Every message starts with `Store "<name>": `, then the key and the refusal.

### Store "<name>": "<key>" is written outside an action. Write it in an action of the store.

A state key was written with `Store.key.set(…)` or `client.set(Store.key, …)`, in a component, a listener or a test. Only an action writes. Write it in an action of the store (`s.key = …`), and call the action.

```ts
const Counter = store({
	name: 'counter',
	state: { n: 0 },
	actions: { inc(s) { s.n += 1; } },
});
Counter.inc(); // not Counter.n.set(1)
```

### Store "<name>": "<key>" is written after its action settled.

An action kept `s` (in a timer or a callback) and wrote after the action's promise settled. Write only while the action runs: `await` what the write depends on, or start another action.

### Store "<name>": "<key>" is not a state key, so it cannot be written.

`s.total = …` where `total` is a computed, or a key the store does not have. Only state is writable.

### Store "<name>": a computed cannot write "<key>".

A computed assigned on its `s`. A computed only reads; move the write to an action.

### Store "<name>": "<key>" is read-only here; write it in an action.

A write on the view `useStore(Store)` or `Store.bind(client)[0]` returns. Write through the actions (`a.add(…)`), never on `s`.

### Store "<name>": the key "<key>" is taken (a state, computed or action key, or one of kind, name, reset, bind, then).

A state, computed or action key repeats, or is one of `kind`, `name`, `reset`, `bind`, `then`. Rename it. The reserved keys are also a type error.

### Store "<name>": two stores are named "<name>" on this client: give each store a unique name.

Two store definitions with one name were used on one client, on the server. Give each a unique `name`. In a browser the newer definition takes over instead (a hot-reloaded module), so this error does not happen there.

### A nested mutation throws a `TypeError` in development

Stored values (initial, written or hydrated) are deep-frozen outside production, so `s.items.push(b)` or `s.items[0].title = …` throws. Replace the value: `s.items = [...s.items, b]`.

### The context lands in an optional argument, or `a.inc()` does not type

The context goes right after the arguments the caller passes or the function declares, whichever is longer. A default value before it (`(s, page = 1, ctx)`) shortens the function's declared length and moves it, and an action whose last parameter is optional or defaulted with no context after it receives the context in that parameter. That shape is a type error (`Add "ctx?: StoreContext" as the last parameter…`): declare the context last.

```ts
inc(s, by?: number, ctx?: StoreContext) { s.n += by ?? 1; }
```

### Reads after an `await` fail with `RIVA_SCOPE`

`BookStore.total.get()` inside an async action, after the first `await`, has no ambient client. Read `s.total` instead: `s` stays bound to the action's client.

## Invalid duration

Code: `RIVA_DURATION` (`RivaError`).

**When:** an option such as `staleTime`, `gcTime` or `refetchEvery` got a value it cannot read, at the `query({...})` call.

**Why:** a duration is a non-negative number of milliseconds (or `Infinity`), or a string of a number (decimals allowed, e.g. `"1.5s"`) and exactly one unit: `ms`, `s`, `m`, `h`.

**Fix:**

```ts
query({ id: 'user', staleTime: '30s', gcTime: '5m', fetch }); // not "30" or "5 min"
```

## Cannot derive a cache key

Code: `RIVA_KEY` (`RivaError`).

**When:** the variables of a query hold a function, a symbol, a bigint, a non-finite number, an invalid `Date` or a circular reference.

**Why:** the key is the definition id plus the stable-serialized variables, so they must be JSON-like.

**Fix:** pass plain data; convert before the call (`id.toString()` for a bigint, an ISO string for an odd date), and keep callbacks out of the variables.

```ts
user.ensure(client, { id: String(id) });
```

## Two definitions share the id "<id>": give each a unique id.

Code: `RIVA_KEY` (`RivaError`).

**When:** two `query` definitions with the same `id` read on one client on the server. In a browser the newest definition takes the entry over (a hot-reloaded module) and nothing is thrown.

**Why:** the cache key is the definition id plus the variables, so two definitions with one id would share one entry and the second would silently run the first's `fetch`.

**Fix:** give each definition a unique id.

```ts
const user = query({ id: 'user', fetch });
const admin = query({ id: 'admin', fetch }); // not 'user' again
```

## `Cannot cache the data: it holds <what>. Use JSON-like values (a Date is allowed).`

Code: `RIVA_CACHE` (`RivaError`).

**When:** a query with `cache: entities()` (or `writeEntity`) receives data holding a function, a symbol, a bigint, a non-finite number, a class instance other than `Date`, a `Map`/`Set` or a circular reference. A fetch rejects with it (the entry shows the error and keeps its previous data). `setData` throws it and leaves the entry untouched. A mutation with `cache: entities()` hits it too: data returned by `optimistic` makes `run` reject before anything is shown, and a server result refused at commit rolls the layers back; in both cases `updates` and `invalidates` do not run and `run` rejects with the error.

**Why:** the entity store merges and compares plain JSON data field by field, so it cannot hold anything else. Nothing is written when it throws.

**Fix:** return plain data from `fetch` (convert class instances with `toJSON()` or a mapper), or keep that query on the default keyed cache.

```ts
fetch: async () => (await res.json()) as Plain, // not a Map, not a model instance
```

## This client already uses other entity identity rules

Code: `RIVA_CACHE` (`RivaError`).

**When:** two `entities()` policies with different `keys` or `identify` (compared by reference) meet on one client, or a policy with such rules is first used after `readEntity` or `writeEntity` filled the client's store.

**Why:** a client has one entity store with one identity rule, so the same object cannot be two entities.

**Fix:** share one policy, or the same options objects, between the client's queries; create it before any `readEntity`/`writeEntity`.

```ts
const cache = entities({ keys }); // one, module level
query({ id: 'a', cache, fetch });
query({ id: 'b', cache, fetch });
```

## `The cache cannot read the query's data after a fetch.`

Code: `RIVA_CACHE` (`RivaError`).

**When:** a fetch succeeded but the query's cache policy cannot read the data it just stored back (`read` returns `undefined`): the entry shows the error status and `ensure` rejects with it. Only a cache that reads selectively can do it, such as the GraphQL `normalized()` one.

**Why:** the answer lacks something the cache needs (a selected field the server left out, an entity it did not identify), so the data would be served half-empty. A second fetch would give the same answer, so none is started. Separately, an observed query whose stored data stops reading later (an entity evicted) is refetched; the error clears once the data reads again.

**Fix:** have the source return everything the cache reads (a nullable GraphQL field must come back as `null`, not be left out), or stop reading the missing part. See the GraphQL cause in the [riva-graphql page](../../riva-graphql/docs/troubleshooting.md).

## `Cannot dehydrate <what> at <path>: snapshots hold JSON values and Dates. Convert it in the fetch, or keep it out of the cache.`

Code: `RIVA_SSR` (`RivaError`).

**When:** `dehydrate` meets a bigint, a function, a symbol, a `Map`, a `Set`, a class instance (other than `Date`), an invalid `Date` or a circular reference in a query entry's data or a named signal's value. `<path>` names the entry (or the signal) and the field, e.g. `invoices:{"year":2026}.data.items[0].total`.

**Why:** a snapshot travels as JSON, so it can hold only what JSON holds, plus Dates, `NaN` and the infinities, which riva tags and restores.

**Fix:** return plain data from `fetch` (a string or a number for a bigint, an array for a `Set`), or keep that query or signal out of the snapshot (leave `ssr: true` off the signal).

```ts
fetch: async () => (await res.json()).items.map((i) => ({ ...i, total: Number(i.total) })),
```

## `Cannot dehydrate: two signals are named "<name>". Give each SSR signal a unique name, or set ssr: false.`

Code: `RIVA_SSR` (`RivaError`).

**When:** `dehydrate` finds two signals with the same `name` that the client has used.

**Why:** signals travel by name, so a snapshot could not tell which one a value belongs to.

**Fix:** rename one, or drop `ssr: true` from the one that stays local.

```ts
const a = signal('', { name: 'draft', ssr: true });
const b = signal('', { name: 'draft', ssr: true }); // collides with a

// fix: rename b, or drop ssr: true from the one that stays local
const local = signal('', { name: 'draft' });
```

## `Cannot hydrate: this is not a snapshot dehydrate() made (version <v>).`

Code: `RIVA_SSR` (`RivaError`).

**When:** `hydrate` receives something that is not a snapshot of this format: `undefined` (the server sent nothing), an object of another shape, or another version.

**Why:** the snapshot's `v` is 1 and it holds `q` and `a`. A different value usually means the page carried something else, or the server and the browser run different versions of riva.

**Fix:** pass what `dehydrate` returned, unchanged, and keep both sides on one version of `@softistx/riva`.

```ts
import type { Snapshot } from '@softistx/riva/ssr';

hydrate(client, JSON.parse(payload) as Snapshot);
```

## Data refetches right after hydration

**When:** the page renders with the server's data, then the same requests go out again as soon as a component subscribes.

**Why:** hydrated entries keep their age. A query's `staleTime` defaults to 0, so data of any age is already stale and a subscription fetches it.

**Fix:** give the query a `staleTime` that covers the render, e.g. `staleTime: '30s'`. Fresh hydrated data is never fetched again.

```ts
const invoices = query({ id: 'invoices', staleTime: '30s', fetch });
```

## The request was aborted

Code: `RIVA_ABORT` (`RivaAbortError`).

**When:** `ensure` rejects with it after the `signal` you passed aborted, or after `cancel` aborted the fetch you were waiting on. A mutation's `run(client, vars, { signal })` rejects with it too, and rolls back its optimistic layers, including while it waits for an earlier mutation to settle (it never commits afterwards).

**Why:** abort is a decision, not a failure: it is never retried and never stored as the query's error; the entry returns to its previous state.

**Fix:** catch it where you abort.

```ts
try {
	await user.ensure(client, { id }, { signal });
} catch (e) {
	if (!(e instanceof RivaAbortError)) throw e;
}
```

## HTTP <status>

Code: `HTTP_<status>` (`RivaHttpError`, a `RivaRequestError`).

**When:** a fetcher threw `new RivaHttpError(status)` without a message, so the message is `HTTP 503`, `HTTP 404`...

**Why:** the server answered with an error status. It is retried for 5xx, 408 and 429 (per `retry`) and never for other statuses.

**Fix:** read `error.status` and `error.cause`; fix the request for a 4xx, or raise `retry` / wait for the server for a 5xx. Pass your own message as the second argument for a clearer text.

## Network error

Code: `RIVA_NETWORK` (`RivaNetworkError`, a `RivaRequestError`).

**When:** a fetcher threw `new RivaNetworkError()` without a message: the request never got a response (offline, DNS, CORS, connection reset).

**Why:** it is always retryable, so the engine retries it per `retry` before settling the error state.

**Fix:** check connectivity and the URL; look at `error.cause` for the underlying failure. On the server `retry` defaults to 0, so set it to retry there.

## `The data route answered <status> with a body that is not JSON.`

Code: `RIVA_INVALID_RESPONSE` (`RivaRequestError`, not retryable). Also `The data route answered without a "data" field.`

**When:** a call made through `postData` (`@softistx/riva/data`, so any `bffTransport`) got an answer that is not the `/_data` route's JSON: an HTML error page from a proxy, a login redirect, a route that is not a `dataRoute`.

**Why:** the transport expects `{ data }` or `{ error: { code, message, status } }`, and retrying cannot change what the URL serves.

**Fix:** check the URL (`url` option, default `/_data`) and that the route mounts `dataRoute`'s `action`. Look at the status the message names and at what sits in front of the route (a proxy, an auth redirect).

## `RIVA_UNKNOWN` on a hydrated error

Code: `RIVA_UNKNOWN`, on the `error` of a hydrated query entry.

**When:** a query failed on the server with something that was not a `RivaError` (a `TypeError` in a fetcher, a thrown string), and the browser reads the entry after `hydrate`.

**Why:** a snapshot carries codes only, never a message, a stack or a cause, so a server detail cannot leak. An error that is not a `RivaError` has no code to carry.

**Fix:** throw riva's errors from fetchers (`RivaHttpError`, `RivaRequestError`...), or map the failure in the fetcher. Log the original error on the server.

## `Several listeners or computeds threw.`

An `AggregateError`, thrown when a write flushes its listeners and more than one of them (an `effect`, a `computed`, a subscriber) throws. With a single failure that error is rethrown as is.

**Fix:** read `error.errors`: it lists every failure, in the order they ran. Fix each listener; one that throws never stops the others from running.

## `The data route answered without a "data" field.`

Code: `RIVA_INVALID_RESPONSE` (`RivaRequestError`, not retryable).

**When:** the data route answered 2xx with JSON that is not `{ data }`, for example a proxy's or a login page's body.

**Fix:** check that the URL given to `postData` (or `bffTransport`) reaches the `dataRoute` action and not another handler; look at the response in the network tab.
