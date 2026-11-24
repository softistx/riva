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
- `RIVA_DURATION`: an invalid duration string. `RIVA_KEY`: variables the key cannot serialize (function, symbol, bigint, cycle). `RIVA_CACHE`: data the entity cache cannot store (see below).

## Mutations

`mutation({ id, run, optimistic?, updates?, invalidates?, cache?, retry?, retryDelay? })` sends a change and shows its expected result at once. The definition is stateless; `run(client, vars, { signal? })` resolves with the server data, or rejects with the error after the rollback. `retry` is a count or a decision (default 0); `retryDelay(failures)` defaults to `min(1000 * 2 ** failures, 30000)` ms.

```ts
import { at, createRivaClient, mutation, query } from '@softistx/riva';

const todos = query({ id: 'todos', fetch: async () => (await fetch('/api/todos')).json() as Promise<string[]> });

const addTodo = mutation<string, string>({
	id: 'addTodo',
	run: async (title, { signal }) =>
		(await fetch('/api/todos', { method: 'POST', body: title, signal })).text(),
	// shown at once, over the committed data; the updater gets the value below
	optimistic: (title, tx) => tx.set(todos, undefined, (prev) => [...(prev ?? []), title]),
	// on success: write the server result into the committed data...
	updates: (tx, saved) => tx.set(todos, undefined, (prev) => [...(prev ?? []), saved]),
	// ...and/or mark queries stale (observed ones refetch)
	invalidates: [todos], // or [at(todos, vars)] for one entry, or (data, vars) => [...]
});

const client = createRivaClient();
await addTodo.run(client, 'Buy milk'); // rejects, with the layer dropped, on failure
```

`tx.set(query, vars, dataOrUpdater)` writes one entry. In `optimistic` it adds a layer over the query's data, dropped when the mutation settles (the updater gets the value below). In `updates` it writes the committed data (the updater gets the committed value). `at(query, vars)` names one entry for `invalidates`, with `vars` checked against the query.

With `cache: entities()`, the data `optimistic` returns is normalized into a layer over the entities, and the server result is committed to the entity store:

```ts
import { entities } from '@softistx/riva/entities';

type Patient = { __typename: 'Patient'; id: string; name: string };

const renamePatient = mutation<{ id: string; name: string }, Patient>({
	id: 'renamePatient',
	cache: entities(),
	run: async (v) => (await fetch(`/api/patients/${v.id}`, { method: 'PATCH', body: JSON.stringify(v) })).json(),
	optimistic: (v) => ({ __typename: 'Patient', id: v.id, name: v.name }), // every query reading Patient:<id> shows it
});
```

- **The layer.** While a mutation is in flight its optimistic writes sit above the committed cache. `client.get`, `subscribe` and computeds see the committed data with the layers applied in start order; the committed data is never mutated. A keyed layer never changes `status` or `isFetching`. A refetch that lands meanwhile updates the committed value and the layer stays on top. Any entity layer change re-evaluates every entity read (a known v1 cost); results keep their identity when unchanged.
- **Rollback.** On failure (after the retries, on an abort, or when the commit is refused with `RIVA_CACHE`) the layers are dropped and readers go back to the value below. Nothing else runs: no `updates`, no `invalidates`. A throwing `invalidates` function counts as a failure.
- **Success.** In one batch (readers see one transition): the result is committed through `cache`, the layers are dropped, `updates` writes the committed data, then `invalidates` runs. If `updates` throws, the server result stays committed, the layers are dropped, the invalidations still run, and `run` rejects with the thrown error; only your helper's own writes may be partial.
- **Order.** Mutations on one client resolve in start order. If B (started after A) succeeds first, its layer stays visible and its commit waits until A settles; A's commit then runs, then B's. If A fails, A's layer is dropped at once and B's still applies on top of the committed data. Clients never share the order.
- **Retry and abort.** `signal` aborts with `RivaAbortError` and rolls back, also while the mutation waits for an earlier one (it never commits afterwards).
- **Server.** `run` works in a React Router action: layers are applied there too but nobody observes them, and no timer is armed (the default is no retry).
- **Traps.** `optimistic` returning data only reaches the entities when `cache` has a `layer` method (`entities()` does); without `cache` write with `tx.set`. `tx.set` targets one entry, so use the variables the reader uses. A data value that is itself a function is taken as an updater. After success the layer is dropped: without `updates` or `cache`, nothing replaces it, so add `updates` or `invalidates` (only observed queries refetch at once). A mutation that succeeded waits for earlier ones: an earlier `run` that never resolves holds it back, so pass a `signal` and abort it.

### Exported types and helpers

`mutation`, `at`; types `Mutation`, `MutationOptions`, `RunOptions`, `Tx`, `Invalidation` and `Target`. `CachePolicy` gained optional `layer(client, data) -> { drop() }` and `commit(client, data)`, which `entities()` implements, and a `committed` flag on `read`.

## Normalized cache

`@softistx/riva/entities`: `entities`, `readEntity`, `writeEntity`, `invalidateEntity`, `evict`. By default a query keeps its data as is, keyed by id and variables. Pass `cache: entities()` from the opt-in `@softistx/riva/entities` entry to store each entity (an object with a string `__typename` and an `id` or `_id`) once, shared by every query that returns it. A refetch of one query then updates the others, and a `client.get` inside a computed re-evaluates only when an entity it read changed.

```ts
import { createRivaClient, query } from '@softistx/riva';
import { entities, evict, invalidateEntity, readEntity, writeEntity } from '@softistx/riva/entities';

type Patient = { __typename: 'Patient'; id: string; name: string };

const cache = entities({
	keys: { Book: (b) => b['isbn'] as string }, // identity of a type (default: id, then _id)
	// identify: (obj) => 'Type:id' | undefined,    // or replace the identity rule
});

const patients = query({
	id: 'patients',
	cache,
	fetch: async () => (await fetch('/api/patients')).json() as Promise<{ items: Patient[] }>,
});
const patient = query({
	id: 'patient',
	cache,
	fetch: async (v: { id: string }) => (await fetch(`/api/patients/${v.id}`)).json() as Promise<Patient>,
});

const client = createRivaClient();
await patients.ensure(client);
await patient.ensure(client, { id: '1' });

writeEntity(client, 'Patient:1', { name: 'Ann' }); // merged; both queries see it
writeEntity(client, 'Patient:1', (prev) => ({ visits: (prev?.['visits'] as number) + 1 }));
readEntity(client, 'Patient:1'); // tracked inside a computed; undefined when missing
invalidateEntity(client, 'Patient:1'); // marks stale every query reaching it, refetches observed ones
evict(client, 'Patient:1'); // removes it: queries see the field as missing
```

- Entities are merged field by field into one store per client (two clients never share). Nested entities, and entities inside arrays, are normalized too; other objects stay inline. An entity unchanged since the last read keeps its identity.
- A query entry holds the entities it reaches. When the entry is replaced or collected (`gcTime`) they are released, and an entity nobody holds is removed. Collection marks what the live entries (and `writeEntity` writes) reach and drops the rest, so entities that reference each other are collected too; a cycle is cut where it loops back when read.
- A ref to a missing entity reads as `undefined`, never throws. Data that is not JSON (a function, a class instance other than `Date`, a bigint, a cycle) throws `RIVA_CACHE`; nothing is written.
- The store follows the identity rules (`keys`, `identify`) of the first policy used on a client. A later policy with other rules, or with rules after `readEntity`/`writeEntity` filled the store, throws `RIVA_CACHE`; share one `entities()` (or the same options objects) between a client's queries. The GraphQL selection-aware walker (fields with arguments, aliases, fragments) comes with `@softistx/riva-graphql`.
- A refused `setData` throws `RIVA_CACHE` and leaves the entry untouched. A refused result of a fetch sets the error status, keeps the previous data and rejects the fetch.
- `CachePolicy` (`write`, `read`, `release`) is the hook behind it, exported from the main entry for other policies.

### Exported types and helpers

`identifyOf(policy, obj)` gives the `Type:id` ref of an object under a policy's identity rule. Types: `EntityPolicy`, `EntitiesOptions`, `Identify`, `Fields`; and `CachePolicy` from the main entry.

### Size budget

The main entry `@softistx/riva` stays within 6144 B gzipped, the main entry with `entities` within 8192 B, and core + react within 9216 B. `bun run size` checks them.
