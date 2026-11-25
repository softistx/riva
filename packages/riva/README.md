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
import { signal, batch, computed, createRivaClient, untracked } from '@softistx/riva';

const count = signal(0);
const double = computed((get) => get(count) * 2); // lazy, cached, tracked dynamically

const client = createRivaClient();
client.subscribe(double, (v) => console.log('double', v));
client.set(count, 2); // logs "double 4"
client.set(count, (n) => n + 1); // logs "double 6"

// Ambient reads: inside client.run, signals and computeds read through that client.
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

- `signal(initial, { name?, equals?, ssr? })` (`ssr: true` with a `name` sends the value in an SSR snapshot), `computed(fn, { name?, equals? })`: stateless definitions. Subscribers fire only when the value changes (`equals`, default `Object.is`), once per change, never on a half-updated graph.
- `client.get / set / subscribe / effect / run / batch`: the whole API outside any ambient scope.
- `effect(() => …)` (free function) re-runs on the ambient client in a browser and is a no-op on the server; `client.effect` always runs.
- Exported types: `Signal`, `SignalOptions`, `ReadonlySignal`, `Computed`, `ComputedOptions`, `Readable`, `Getter`, `Listener`, `Unsubscribe`, `EffectFn`.

### Errors

`RivaError` is the base class (with a `code`); all are defined once here so `instanceof` holds.

- `RIVA_SCOPE` (`RivaScopeError`): a read with no client in scope.
- `RIVA_CYCLE`: a computed that reads itself.
- `RIVA_LOOP`: a node re-ran more than 100 times in one flush (for example an effect that keeps writing its own source).
- Listeners and effects that throw never stop the others: every notification runs, then the single error is rethrown as is, and several become an `AggregateError`.

See [troubleshooting](./docs/troubleshooting.md).

### Scope errors

Calling `signal.get()` (or `set`, `subscribe`) with no client in scope throws `RivaScopeError` (`RIVA_SCOPE`): "No RivaClient in scope". Fix it by reading through `client.get(def)` or wrapping the code in `client.run(() => …)`. In a browser you can set one default client with `setDefaultClient(client)`; on the server it throws, since a module-level client would leak between requests. `setDefaultClient(undefined)` clears the default.

## Queries

A query is a stateless definition: an `id`, and a `fetch` that gets typed variables and returns data. The core is transport-agnostic (the GraphQL and REST adapters supply the id and the fetcher); here it is over a plain `fetch`. Cache entries live in the `RivaClient`, keyed by the id and the stable-serialized variables. A query is typed `Query<Vars, Data, State>`: `client.get` and `subscribe` return `State`, which is `QueryState<Data>` unless a definition (such as `infinite`) derives more.

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
user.cancel(client, { id: '1' }); // aborts the fetch, restores the previous state (an observed entry whose data reads undefined is fetched again after a cancel)
```

- **Status model**: `idle | pending | success | error`, plus `isFetching`. A background refetch keeps `status: 'success'` and the old data with `isFetching: true`; an error keeps the last data.
- **Staleness**: besides `staleTime` and `invalidate`, data the cache can no longer read (an evicted entity) counts as stale, so `ensure` fetches it and an observed entry refetches.
- **Dedupe**: one in-flight fetch per key; concurrent `ensure` and `subscribe` share it.
- **Subscribe options**: `client.subscribe(def, vars, listener, { staleTime })` overrides the definition's `staleTime` for this observer's first fetch decision only, e.g. to trust data an `ensure` just loaded (riva-react's Suspense uses `{ staleTime: 1000 }`). Later invalidations, polls and refetches keep the definition's own `staleTime`.
- **Options**: `staleTime` (0), `gcTime` (5 min in a browser, `Infinity` on the server: no timers, a per-request client is just dropped), `retry` (3 in a browser, 0 on the server; a count or `(failures, error) => boolean`), `retryDelay` (default `min(1000 * 2 ** failures, 30_000)`), `refetchOnFocus` / `refetchOnReconnect` (true; observed and stale entries only, browser only), `refetchEvery` (polling while observed; browser only, like focus and reconnect: no timer is armed on the server).
- **Abort**: the fetcher gets `signal`. `ensure(client, vars, { signal })` rejects with `RivaAbortError` when the caller aborts; the shared fetch is aborted only when no other waiter or observer remains, and an aborted fetch never writes an error state.
- **Tests and other hosts**: `createRivaClient({ scheduler: { now, setTimeout, clearTimeout }, events: { onFocus, onReconnect } })` replaces the clock, timers and window events.
- Variables are optional at call sites when the fetcher takes none; `Vars` and `Data` are inferred from `fetch`.

### Exported types and helpers

`stableKey(id, vars)` derives the cache key (sorted object keys, `Date` as ISO, `undefined` dropped). Types: `Query`, `QueryOptions`, `QueryState`, `QueryStatus`, `EnsureOptions`, `SubscribeOptions`, `FetchContext` (`{ signal, client }`), `VarsArgs`, `Duration`, and for the injectable environment `Scheduler` and `ClientEvents`.

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

`@softistx/riva/entities`: `entities`, `readEntity`, `writeEntity`, `invalidateEntity`, `evict`, `identifyOf`, `isPlain`, `isRef` (and the types below). By default a query keeps its data as is, keyed by id and variables. Pass `cache: entities()` from the opt-in `@softistx/riva/entities` entry to store each entity (an object with a string `__typename` and an `id` or `_id`) once, shared by every query that returns it. A refetch of one query then updates the others, and a `client.get` inside a computed re-evaluates only when an entity it read changed.

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
- The store follows the identity rules (`keys`, `identify`) of the first policy used on a client. A later policy with other rules, or with rules after `readEntity`/`writeEntity` filled the store, throws `RIVA_CACHE`; share one `entities()` (or the same options objects) between a client's queries. The plain walker stores every field of an object; a GraphQL selection-aware one (fields with arguments, aliases, fragments) is `normalized()` from `@softistx/riva-graphql/cache`, built on the codec below.
- A plain read skips fields stored under a key holding `(`, the argument fields a selection-aware codec writes: `readEntity` and a plain `entities()` never show them.
- **A miss is refetched, or an error.** When an observed entry's stored data stops reading (`read` returns `undefined`, e.g. an evicted entity), the engine refetches it, whenever it happens, and `ensure` fetches too rather than resolve nothing. When a fetch's own result cannot be read back, the entry ends in the error status with `RivaError` code `RIVA_CACHE` ("The cache cannot read the query's data after a fetch."), `ensure` rejects with it, and nothing loops; the error clears once the data reads again. Optimistic layers and `derive` never trigger it.
- A refused `setData` throws `RIVA_CACHE` and leaves the entry untouched. A refused result of a fetch sets the error status, keeps the previous data and rejects the fetch.
- `CachePolicy` is the hook behind it, exported from the main entry for other policies: `write(client, data, prev, vars)`, `read(client, stored, committed)`, `release(client, stored)`, and for mutations the optional `layer(client, data, vars)` (an optimistic layer, `{ drop() }`) and `commit(client, data, vars)`. `vars` are the variables of the query or mutation that gave `data`.

### A codec of your own

`entities(opts, codec)` takes an `EntityCodec` that decides how data becomes entities and back, for data whose shape a plain walk cannot know:

```ts
import { entities, type EntityCodec } from '@softistx/riva/entities';

const codec: EntityCodec = {
	// `reader.identify(obj)` gives `Type:id`; nothing is merged until `pending` is returned whole.
	normalize: (reader, data, vars) => ({
		root: { vars, data }, // what the entry keeps
		pending: new Map([['Patient:1', { name: 'Ada' }]]), // fields to merge, by entity
	}),
	// Runs in a computed: read entities through `reader.fields`, so the read is tracked.
	denormalize: (reader, root) => ({ name: reader.fields('Patient:1')?.['name'] }),
};

const cache = entities(undefined, codec);
```

`EntityReader` is what a codec sees of the store: `identify`, `peek` (committed, untracked) and `fields` (tracked, layers applied). Return `undefined` from `denormalize` for a miss: the engine then refetches, as above.

### Exported types and helpers

`identifyOf(policy, obj)` gives the `Type:id` ref of an object under a policy's identity rule; `isPlain` and `isRef` test stored values. Types: `EntityPolicy`, `EntitiesOptions`, `Identify`, `Fields`, `EntityCodec`, `EntityReader`, `Normalized`, `Ref`; and `CachePolicy` from the main entry.

## Infinite lists

`@softistx/riva/infinite`: `infinite`. A cursor-paginated list is a query whose data is the pages loaded so far. It reads like any query (`client.get`, `subscribe`, `ensure`, `invalidate`, `setData`, staleness, `gcTime`, `retry`, `cache`) and adds `fetchNext` and `fetchPrevious`. The default page shape is a Relay connection (`edges[].node`, `pageInfo` with `hasNextPage`, `hasPreviousPage`, `startCursor`, `endCursor`).

```ts
import { createRivaClient } from '@softistx/riva';
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

const client = createRivaClient();
await feed.ensure(client, { search: 'a' }); // the first page
await feed.fetchNext(client, { search: 'a' }); // appends the next page
await feed.fetchPrevious(client, { search: 'a' }); // prepends the previous page

const s = client.get(feed, { search: 'a' });
s.data?.nodes; // every loaded node, flattened (memoized per data)
s.data?.pages; // the pages as fetched
s.hasNext; s.hasPrevious; s.isFetchingNext; s.isFetchingPrevious;
```

- `Page` and `Node` are inferred from `fetch` and `connection`. The caller's variables are those of `fetch` without `after` and `before`; the library adds the cursor, and strips a cursor variable the caller passes. With another name, set `cursor: { after: 'name', before: 'name' }` (both must be declared in the variables).
- `fetchNext` and `fetchPrevious` return one promise while in flight (deduped), and resolve at once when there is no next or previous page, or no page loaded yet. They use `retry` and `retryDelay`. An error keeps the loaded pages and sets `status: 'error'` and `error`; the next successful page clears it. `cancel` aborts them as well as a refetch.
- A refetch (stale, `invalidate`, focus) re-runs every loaded page in order, from the first page's cursor, taking each next cursor from the fresh page before it, so inserted or removed items never skip or repeat a node. It stops when `hasNextPage` turns false (a list that shrank loads fewer pages) and swaps all pages in as one change; an error or abort keeps the old pages.
- `fetchNext` and `fetchPrevious` wait for a refetch in flight, then read the cursor from the fresh pages (no next page: nothing happens). A page that arrives after the list moved under it (a refetch finished, `setData` replaced the pages) is not mixed in: it is fetched again from the new cursor. An `invalidate` made meanwhile is kept, so the next read refetches.
- The page and the `isFetchingNext` / `isFetchingPrevious` reset land as one change.
- With `cache: entities()`, nodes are shared with every other query. `writeEntity` and `invalidateEntity` reach the feed like any query.
- `setData` and `tx.set` on a feed take the stored shape, `{ pages, params }`, where `params[i]` is the cursor page `i` was fetched with (`{}` for the first, `{ after }` going forward, `{ before }` going back); `nodes` and the flags are derived and never stored. An optimistic edit of a node belongs in the entity layer, an added or removed node in `tx.set` on the pages.
- Pagination is forward-only for servers that do not take `before`: `hasPrevious` then stays false.

### Exported types and helpers

`infinite`; types `Infinite`, `InfiniteOptions`, `InfiniteData`, `InfiniteList`, `InfiniteState`, `Connection`, `Edge`, `PageInfo`, `PageParam`, `Cursors` and `FeedVars`.

## Stores

`@softistx/riva/store`: `store`. One definition per domain groups its state, computeds and actions. Every state key is a signal named `<name>.<key>` and every computed a riva computed, so both are read as definitions (`.get()`, `client.get()`, `useValue()`). Like any definition, a store is stateless: its values live per `RivaClient`, one instance per client.

```ts
import { createRivaClient, mutation } from '@softistx/riva';
import { store, type StoreContext } from '@softistx/riva/store';

const saveBook = mutation<{ book: Book }, Book>({ id: 'saveBook', run: postBook });

export const BookStore = store({
	name: 'books', // required, unique on a client; prefixes the signal names
	ssr: true, // every state key travels in an SSR snapshot (default false)
	state: { items: [] as Book[], filter: '', saving: false },
	computed: {
		visible: (s) => s.items.filter((b) => b.title.includes(s.filter)), // s: the state, tracked per key
		total: (s) => s.items.length,
		discount: (s, get) => (get(UserStore.vip) ? 0.1 : 0), // other stores through their definitions
	},
	actions: {
		add(s, book: Book) {
			s.items = [...s.items, book]; // top-level assignment; one call, one notification
		},
		filterBy(s, q: string) {
			s.filter = q;
		},
		async save(s, book: Book, { mutate }: StoreContext) {
			s.saving = true;
			const saved = await mutate(saveBook, { book });
			s.items = [...s.items, saved];
			s.saving = false;
		},
	},
});

const client = createRivaClient();
client.get(BookStore.visible); // explicit client
client.run(() => {
	BookStore.total.get(); // ambient read
	BookStore.add(book); // an action, on the ambient client
	BookStore.reset(); // every state key back to its initial value
});
const [s, a] = BookStore.bind(client); // a read-only view of state and computeds, and the actions
await a.save(book); // `s` stays bound to `client` across the await
```

- **Only actions write**, by top-level assignment on `s`. A state key is typed `ReadonlySignal` (no `set`), and a write made any other way (`BookStore.items.set(…)`, `client.set(BookStore.items, …)`, a computed, an unknown key) throws `RIVA_STORE`. The exceptions are `hydrate` and `reset()`. Values are immutable: replace them (`s.items = [...s.items, b]`). In development a stored value is deep-frozen (when `process.env.NODE_ENV` is not `production`), so `s.items.push(b)` throws.
- **Batched.** Every action runs in a batch: one call, one notification. After an `await`, the writes of one synchronous segment make one notification at its end; unrelated writes made on that client in that segment are held until then.
- **`s` and `ctx`.** An action is `(s, ...args, ctx)`; callers pass only `args`. Annotate `ctx: StoreContext` to type it (`{ client, fetch, mutate }`, where `fetch(query, vars?)` is `query.ensure(client, …)` and `mutate(mutation, vars?)` is `mutation.run(client, …)`). The context goes right after the declared arguments: give optional arguments `?`, never default values, before it. `s` reads state and computeds, writes state, and is revoked once the action settles (a later write throws `RIVA_STORE`, reads still work).
- **Computeds** receive `(s, get)`: `s` holds the state only (no other computed), `get(def)` reads any other definition, another store's included. A cycle is refused with `RIVA_CYCLE`.
- **Names.** `name` is required. A state, computed or action key cannot repeat, nor be `kind`, `name`, `reset` or `bind` (refused at definition). Two stores with one name on a client are refused with `RIVA_STORE` when the second is first used on it.
- **`reset(client?)`** puts every state key back to its initial value (the same reference, so the key no longer travels in a snapshot) in one notification. A write an async action makes after the reset still applies.
- **SSR.** With `ssr: true` every state key travels as `<name>.<key>` (computeds never do); by default nothing does. A snapshot seeds a store first used after `hydrate`. Hot reload: reload the page when a store module changes, since a re-evaluated module is a second store with the same name.
- The deep signals (per-path reactivity on nested state) and store families (one instance per key) come later.

### Exported types and helpers

`store`; types `Store`, `StoreOptions`, `StoreContext`, `Action`, `Args`, `Bound` and `View`. `ReadonlySignal` comes from the main entry.

## Server rendering

`@softistx/riva/ssr` moves what a request fetched to the browser, so the first render needs no second fetch. It holds no state of its own: a snapshot is plain JSON.

```ts
import { createRivaClient } from '@softistx/riva';
import { dehydrate, hydrate } from '@softistx/riva/ssr';

const client = createRivaClient();

// On the server, once the request's loaders are done:
const snapshot = dehydrate(client); // JSON-safe, hand it to the page

// In the browser, before the first render:
hydrate(client, snapshot);
```

The snapshot's fields are an opaque format that may change: never build or edit one, only pass on what `dehydrate` returned.

**Embedding the snapshot safely.** Hand it to the page through the host's loader data (React Router serializes it safely). If you inline it in a `<script>` yourself, escape `<` so a value such as `</script>` cannot close the tag:

```ts
const json = JSON.stringify(snapshot).replace(/</g, '\\u003c');
html = `<script id="riva" type="application/json">${json}</script>`;
```

- `dehydrate(client)` writes the settled query entries (successes and errors; idle and in-flight ones are skipped), read as readers see the committed data, so a normalized or infinite entry travels denormalized and is stored again by its own cache policy on arrival. Optimistic layers never travel. Each entry carries its age, not the server's clock, so a skewed clock cannot make fresh data stale.
- Signals travel only when they opt in with `ssr: true`, have a unique `name` and changed from their initial value (`signal(0, { name: 'cart', ssr: true })`). Every other signal stays local, riva's own included.
- `hydrate(client, snapshot)` seeds entries and signals the client has not created yet, at the moment their definition is first used, so the hydrating code needs none of the definitions. An entry the client already has is replaced only by a newer snapshot, and never while it is fetching or carries optimistic layers; an existing signal is never overwritten. With `{ deferObserved: true }` (for a render) nothing that could reach an observed entry is written: the entries something observes, those with a cache policy (they share entities) and those not created yet are returned as a snapshot to apply later, outside the render, with `hydrate(client, deferred)`. Its ages are understated by the delay.
- A fresh entry is not fetched again: data hydrated with the definition's `staleTime` (the default is 0, see [troubleshooting](./docs/troubleshooting.md)) stays fresh for it. A failed entry comes back as a `RivaError` (a `RivaRequestError` when it had a status), with its code, status and `retryable` and an empty message (`RIVA_NETWORK`, `HTTP_<n>` and `RIVA_ABORT` come back as `RivaNetworkError`, `RivaHttpError` and `RivaAbortError`). A message never travels, so a server detail cannot leak; anything that was not a `RivaError` travels as `RIVA_UNKNOWN`, and no stack or cause ever travels.
- Dates survive (`{ $t: 'D' }`), as do `NaN` and the infinities. A bigint, a function, a symbol, a `Map`, a `Set`, an instance of a class or a cycle is refused with `RIVA_SSR`, naming its path.
- `setScopeResolver(fn)` lets a host (a request context kept in an `AsyncLocalStorage`, for instance) supply the ambient client. `fn` is `() => RivaClient | undefined`; `client.run` still wins, then the resolver, then the browser's default client. With no resolver, or one that returns `undefined`, a server read with no client throws as before. There is one resolver per process: a second call replaces the first.

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import type { RivaClient } from '@softistx/riva';
import { setScopeResolver } from '@softistx/riva/ssr';

const als = new AsyncLocalStorage<RivaClient>();
setScopeResolver(() => als.getStore());
```

### Exported types and helpers

`dehydrate`, `hydrate`, `encode`, `decode`, `setScopeResolver` and the type `Snapshot`.

## Data route client

`@softistx/riva/data` is the browser's side of a `/_data` route, shared by the adapters' `bffTransport` (`@softistx/riva-graphql/bff`, `@softistx/riva-rest/bff`). You only import it to write a transport of your own.

```ts
import { type BffTransportOptions, postData } from '@softistx/riva/data';

const data = await postData({ url: '/_data' }, 'rest:getInvoice', { param: { id: '7' } }, signal);
```

`postData(opts, id, variables, signal?)` posts `{ id, variables }` (variables in the SSR codec, so Dates travel), and returns the decoded `{ data }`. The route's `{ error: { code, message, status } }` is thrown as a `RivaRequestError` with that `code` and `status` (retryable for 5xx, 408 and 429); a failed fetch is a `RivaNetworkError`, an abort a `RivaAbortError`, a body that is not the route's JSON `RIVA_INVALID_RESPONSE`. `BffTransportOptions` is `{ url? ('/_data'), fetch?, headers? (a function) }`. Exports: `postData` and the type `BffTransportOptions`.

## Size budget

The main entry `@softistx/riva` stays within 6144 B gzipped, the main entry with `entities` or with `infinite` within 8192 B each, the main entry with `ssr` within 7424 B, the main entry with `store` within 7424 B, the main entry with every subpath within 11264 B, core + react within 9216 B, and the main entry with `data` within 7168 B. `@softistx/riva-graphql` with the entities and its `/cache` stays within 11264 B (`bun run size` checks every row).
