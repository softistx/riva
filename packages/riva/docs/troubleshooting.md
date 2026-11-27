# Troubleshooting

Each entry is headed by the message you will see.

## No Riva in scope

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** `signal.get()`, `.set()`, `.subscribe()` or `computed.get()` ran outside any riva, on the server or in a browser with no default riva.

**Why:** definitions are stateless and hold no value; values live in a `Riva`. A module-level riva on the server would leak between requests, so none is assumed.

**Fix:** read through the riva, or run the code inside it.

```ts
const riva = createRiva(); // one per request on the server
riva.get(count);
riva.run(() => count.get());
```

## "<name>" is reserved.

Code: `RIVA_DEFINITION` (`RivaError`).

**When:** `createRiva({ <name>: extension })` was given an extension under the name of a `Riva` member (`get`, `set`, `subscribe`, `run`, `queries`, …).

**Why:** an extension is installed as `riva[name]`; that name is already taken, and overwriting it would break the riva.

**Fix:** rename the key.

```ts
createRiva({ get: withGraphQL(gql) }); // throws: "get" is reserved.
createRiva({ graphql: withGraphQL(gql) }); // riva.graphql
```

## setDefaultRiva is browser-only

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** `setDefaultRiva(riva)` ran where there is no `document`, that is on the server.

**Why:** a default riva is module-level state; shared between requests it would mix one user's values into another's.

**Fix:** call it only in browser code. On the server, use the per-request riva with `riva.run(() => …)`. `setDefaultRiva(undefined)` clears the default in a browser.

```ts
if (typeof document !== 'undefined') setDefaultRiva(createRiva());
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
riva.effect(() => {
	const n = riva.get(count);
	if (n < 5) riva.set(count, n + 1); // converges
});
```

## RIVA_STORE

Code: `RIVA_STORE`. Thrown by `@softistx/riva/store` and `useStore`. Every message starts with `Store "<name>": `, then the key and the refusal.

### Store "<name>": "<key>" is written outside an action. Write it in an action of the store.

A state key was written with `Store.key.set(…)` or `riva.set(Store.key, …)`, in a component, a listener or a test. Only an action writes. Write it in an action of the store (`s.key = …`), and call the action.

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

A write on the view `useStore(Store)` or `Store.bind(riva)[0]` returns. Write through the actions (`a.add(…)`), never on `s`.

### Store "<name>": the key "<key>" is taken (a state, computed or action key, or one of kind, name, reset, bind, then).

A state, computed or action key repeats, or is one of `kind`, `name`, `reset`, `bind`, `then`. Rename it. The reserved keys are also a type error.

### Store "<name>": two stores are named "<name>" on this riva: give each store a unique name.

Two store definitions with one name were used on one riva, on the server. Give each a unique `name`. In a browser the newer definition takes over instead (a hot-reloaded module), so this error does not happen there. A replaced definition that a component still holds (the old module, read again after the new one) resolves to the current instance: it neither takes the name back nor resets the state.

The browser test is `'document' in globalThis`. A server or a test run that defines `document` (happy-dom, jsdom) is taken for a browser, so a second store with the same name takes over there instead of throwing. The fix is one definition per name, or a different name for each; remove the DOM globals from server code.

### A nested mutation throws a `TypeError` in development

Stored values (initial, written or hydrated) are deep-frozen outside production, so `s.items.push(b)` or `s.items[0].title = …` throws. Replace the value: `s.items = [...s.items, b]`.

### The context lands in an optional argument, or `a.inc()` does not type

The context goes right after the arguments the caller passes or the function declares, whichever is longer. A default value before it (`(s, page = 1, ctx)`) shortens the function's declared length and moves it, and an action whose last parameter is optional or defaulted with no context after it receives the context in that parameter. That shape is a type error (`Add "ctx?: StoreContext" as the last parameter…`): declare the context last.

```ts
inc(s, by?: number, ctx?: StoreContext) { s.n += by ?? 1; }
```

### Reads after an `await` fail with `RIVA_SCOPE`

`BookStore.total.get()` inside an async action, after the first `await`, has no ambient riva. Read `s.total` instead: `s` stays bound to the action's riva.

## Invalid duration

Code: `RIVA_DURATION` (`RivaError`).

**When:** an option such as `staleTime`, `gcTime` or `refetchEvery` got a value it cannot read, at the `query({...})` call, or `toMs` (from `@softistx/riva/resource`) got an invalid string, or a call-level `staleTime` under Suspense (`suspenseStaleTime`, `useQuery`) did.

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
user.ensure(riva, { id: String(id) });
```

## Two definitions share the id "<id>": define each query once (a module-level const) and import it, or pass a distinct id.

Code: `RIVA_KEY` (`RivaError`).

**When:** two `query` definitions with the same `id` are read on one riva on the server. In a browser a hot reload takes over: the newest definition replaces the old one under that id and nothing is thrown. A replaced definition that comes back (the old one read again after the new one) throws.

**Why:** the cache key is the definition id plus the variables, so two definitions with one id would share one entry and the second would silently run the first's `fetch`.

**Fix:** define each query once, as a module-level const, and import it where it is read. Pass a distinct `id` only when two definitions are genuinely different.

```ts
// queries.ts
export const user = query({ id: 'user', fetch });

// elsewhere
import { user } from './queries';
```

```ts
const admin = query({ id: 'admin', fetch }); // an escape hatch: not 'user' again
```

## `Cannot cache the data: it holds <what>. Use JSON-like values (a Date is allowed).`

Code: `RIVA_CACHE` (`RivaError`).

**When:** a query with `cache: entities()` (or `writeEntity`) receives data holding a function, a symbol, a bigint, a non-finite number, a class instance other than `Date`, a `Map`/`Set` or a circular reference. A fetch rejects with it (the entry shows the error and keeps its previous data). `setData` throws it and leaves the entry untouched. A mutation with `cache: entities()` hits it too: data returned by `optimistic` makes `mutate` reject before anything is shown, and a server result refused at commit rolls the layers back; in both cases `updates` and `invalidates` do not run and `mutate` rejects with the error.

**Why:** the entity store merges and compares plain JSON data field by field, so it cannot hold anything else. Nothing is written when it throws.

**Fix:** return plain data from `fetch` (convert class instances with `toJSON()` or a mapper), or keep that query on the default keyed cache.

```ts
fetch: async () => (await res.json()) as Plain, // not a Map, not a model instance
```

## `This riva already uses other entity identity rules. Share one entities() (or the same identify) between its queries.`

Code: `RIVA_CACHE` (`RivaError`).

**When:** a policy with a custom `identify` meets another policy that brings a different `identify` or any `keys` on one riva, or is first used after keys or entities were already in the store.

**Why:** a custom `identify` replaces the whole identity, so it cannot share the store with other rules.

**Fix:** share one `identify` function between the policies, or use `keys` instead of `identify`.

## `This riva's store already holds "<Type>" entities identified another way (by id, by another policy, or by writeEntity). Declare the "<Type>" key in every policy that sees it (share one function), before the store is used.`

Code: `RIVA_CACHE` (`RivaError`).

**When:** a policy declares `keys` for a type whose entities the store already holds, because another policy without that key (default `id`), or `readEntity`/`writeEntity`, put them there first. It depends on order: on the client, hydration seeds the store through each definition as it is first used, so the same code can pass in one order and fail in another.

**Why:** `Type:id` must mean one thing; changing a type's key after entities exist would split them.

**Fix:** declare a shared type's key in every policy that can see that type, sharing one function, and create the policies before the store is used.

```ts
const keys = { Pen: (o: Fields) => o['sku'] as string }; // one definition
const a = entities({ keys });
const b = entities({ keys }); // or entities({ keys: { Pen: keys.Pen } })
```

## `Two entity policies key "<Type>" differently on this riva. Give both the same key function (share one definition).`

Code: `RIVA_CACHE` (`RivaError`).

**When:** two policies on one riva declare a `keys` entry for the same type with different functions (two inline arrows are different functions, even when they read the same field).

**Why:** the riva's one store identifies a type with one function, so `Type:id` means the same entity for every policy.

**Fix:** define the key function once and share it.

```ts
const invoiceKey = (o: Fields) => o['id'] as string; // module level
const a = entities({ keys: { Invoice: invoiceKey } });
const b = entities({ keys: { Invoice: invoiceKey, Patient: patientKey } });
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

**When:** `dehydrate` finds two signals with the same `name` that the riva has used.

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

hydrate(riva, JSON.parse(payload) as Snapshot);
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

**When:** `ensure` rejects with it after the `signal` you passed aborted, or after `cancel` aborted the fetch you were waiting on. A mutation's `mutate(riva, vars, { signal })` rejects with it too, and rolls back its optimistic layers, including while it waits for an earlier mutation to settle (it never commits afterwards).

**Why:** abort is a decision, not a failure: it is never retried and never stored as the query's error; the entry returns to its previous state.

**Fix:** catch it where you abort.

```ts
try {
	await user.ensure(riva, { id }, { signal });
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

## `The resource is disabled: await it once enabled is true.`

Code: `RIVA_DEFINITION` (`RivaError`).

**When:** you `await` a `resource(...)` while its `enabled` option is false.

**Why:** a disabled resource has no key to load, and its `source` is never called.

**Fix:** await it once `enabled` is true, or read `state` (`idle` while disabled) instead of awaiting.

```ts
const r = resource(riva, source, { enabled: () => riva.get(signedIn) });
if (riva.get(signedIn)) await r;
```

## A resource never fetches

**When:** `resource(...).state` stays `loading` and no request starts.

**Why:** a resource is lazy. It observes its entry only while something subscribes to it or an observed computed or effect reads `state`, and only in a browser. A plain read, and any read on the server, starts nothing.

**Fix:** `subscribe` to it, read `state` inside an effect, or `await` it for a one-shot load (the only way on a server).

```ts
const stop = riva.effect(() => render(books.state));
```

## A stream resource restarts on every change, or not at all

**When:** `streamResource`'s stream restarts although the variables are equal, or does not restart after a change.

**Why:** the stream restarts when the factory `source` returns is a new function, and `source` runs again only when what it reads changes. Return a new `(signal) => iterable` each time (reading the variables through the tracked getters); returning one shared function never restarts it.

**Fix:** build the factory inside `source`.

```ts
streamResource(riva, () => {
	const id = riva.get(roomId);
	return (signal) => subscribeToRoom(id, signal);
});
```

## `GraphQLError` is not exported by `@softistx/riva/resource`

**When:** `import { GraphQLError } from '@softistx/riva/resource'` (or from `@softistx/riva-graphql`) fails after 0.7.0, or `error.name === 'GraphQLError'` never matches.

**Why:** the class is `RivaGraphQLError` now, and its `name` is `'RivaGraphQLError'`, so it cannot be mistaken for the `GraphQLError` of the `graphql` package. `GraphQLErrorEntry` keeps its name. There is no alias.

**Fix:** import `RivaGraphQLError` and match with `instanceof`.

```ts
import { RivaGraphQLError } from '@softistx/riva/resource';

if (error instanceof RivaGraphQLError) error.errors;
```

## `The stream of the live query "…" completed without a value.`

**When:** `ensure()`, `useQuery` or `riva.get` on a `liveQuery` rejects with `RIVA_LIVE` and the message above, naming the query's id.

**Why:** the `Observable` returned by `observe` completed (an `EMPTY`, a `filter` that dropped everything, a `take(0)`) before emitting a first value. A live query's first value is its first result, so there is nothing to resolve with. A stream that completes after a value is fine: the last value is kept and it does not reconnect.

**Fix:** make the stream emit before it completes, for instance `startWith(initial)`, or `defaultIfEmpty(initial)` when it may be empty.

```ts
import { defaultIfEmpty } from 'rxjs';

liveQuery({ id: 'prices', observe: (symbol: string) => prices$(symbol).pipe(defaultIfEmpty(0)) });
```
