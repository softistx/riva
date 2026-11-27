# @softistx/riva

## 0.11.0

### Minor Changes

- [#130](https://github.com/softistx/riva/pull/130) [`52fc5c6`](https://github.com/softistx/riva/commit/52fc5c63d6888f34885384b3daa98e6758e83199) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A GraphQL query with `@defer` or `@stream` renders progressively through `useGraphQL` and `useQuery`: `data` is readable from the first part (`status: 'success'`, `isFetching: true`, `dataState: 'streaming'`), each part updates it, and `dataState` becomes `'complete'` at the end, with no loop in the component. The core's `FetchContext` gains `onPart(data)` and `QueryState` an optional `dataState`; a transport's `execute` receives `onPart` for a query, and `graphqlClientTransport` iterates `client.query(...)` for an incremental operation. With `normalized()` each part is merged into the cache, a field only a `@defer` fragment selects being left out until its part arrives. Suspense resolves at the first part in a browser. A plain query is unchanged.

- [#130](https://github.com/softistx/riva/pull/130) [`52fc5c6`](https://github.com/softistx/riva/commit/52fc5c63d6888f34885384b3daa98e6758e83199) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `connect(riva, state, obs$)` to `@softistx/riva/rxjs`: subscribes to an Observable and writes each value into a signal of that riva, returning an idempotent stop that unsubscribes. The Observable's type must match the signal's; `complete` keeps the last value, an `error` ends the connection and is swallowed (the signal keeps its last value). Also adds the RxJS guide and troubleshooting entries.

- [#130](https://github.com/softistx/riva/pull/130) [`52fc5c6`](https://github.com/softistx/riva/commit/52fc5c63d6888f34885384b3daa98e6758e83199) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `liveQuery({ id, observe })` to `@softistx/riva/rxjs`: a query fed by an Observable, used like any query (`riva.get`, `subscribe`, `ensure`, `useQuery(liveQuery)`), with a derived key and a cache. On the server `ensure()` resolves at the first value, then unsubscribes (the request signal stops a silent stream), and the snapshot carries the value. In a browser it is subscribed while observed and kept for `gcTime` after the last release; an error keeps the last data and `refetch()` (or a new observer) subscribes again; `complete` keeps the last value (a stream that completes without a value rejects).

- [#130](https://github.com/softistx/riva/pull/130) [`52fc5c6`](https://github.com/softistx/riva/commit/52fc5c63d6888f34885384b3daa98e6758e83199) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add the `@softistx/riva/rxjs` subpath: `toObservable(riva, def, vars?)` returns a cold Observable of full states for a query (subscribing observes it like `useQuery`, unsubscribing releases it, an error is a value), a signal, a computed or a mutation handle; `data$` maps to the data alone; `fromAsyncIterable` (also reachable as `toObservable(iterable)`) turns an async iterable into an Observable, calling `return()` on unsubscribe. `rxjs ^7.8` is an optional peer, imported only by this subpath.

## 0.10.0

### Minor Changes

- [#122](https://github.com/softistx/riva/pull/122) [`d81a3fa`](https://github.com/softistx/riva/commit/d81a3fa1448000a1ff74aad231877ec189afa3c3) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Breaking: a mutation's `run` is now `mutate`, with no alias. The option, the definition method and the hooks' result are renamed together; `riva.run(() => …)` (the scope runner) and the `/_data` operations' `run` are unchanged.
  
  Migration:
  
  - `def.run(riva, vars)` becomes `def.mutate(riva, vars)` (core, `riva.graphql.mutation`, `riva.rest.mutation`).
  - `mutation({ id, run })` becomes `mutation({ id, mutate })` (core and the REST free form).
  - `const { run } = useMutation(def)` becomes `const { mutate } = useMutation(def)`; the same for `useGraphQLMutation`, `useRestMutation` and `useMutationHandle`.
  - `mutationHandle(riva, run)` keeps its shape; only the parameter is named `mutate`.

- [#114](https://github.com/softistx/riva/pull/114) [`8327261`](https://github.com/softistx/riva/commit/8327261143ea900dfcf5da72f4f2d2cdf1fc16ec) Thanks [@SteveGT96](https://github.com/SteveGT96)! - One entity store per riva, shared by every policy on it: `entities()`, `restEntities()` and `normalized()` policies with different `keys` now merge their keys per type instead of being refused. The same type keyed by two different functions, or a key added for a type the store already holds, throws `RIVA_CACHE`; a custom `identify` stays exclusive.

### Patch Changes

- [#112](https://github.com/softistx/riva/pull/112) [`e515cdb`](https://github.com/softistx/riva/commit/e515cdbbd10f5a90d3d8a68cc68ff2195f45b3d8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Replaced store definitions are remembered weakly so they can be collected, the never-held-definition limit is documented, and the router provider tests the browser like the core does.

## 0.9.0

No changes in this release.

## 0.8.0

No changes in this release.

## 0.7.2

### Patch Changes

- [#104](https://github.com/softistx/riva/pull/104) [`7ea2dee`](https://github.com/softistx/riva/commit/7ea2dee5a79a0372a9a7142f8d9321c2f66eb1cb) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Fixes a resource that stayed observed (never garbage-collected, still refetching) after its last computed or effect reader was dropped, when its entry had no polling. The resource now stops at the next microtask, and starts again when a reader (a cached computed included) observes it again.

## 0.7.1

No changes in this release.

## 0.7.0

### Minor Changes

- [#98](https://github.com/softistx/riva/pull/98) [`97b6618`](https://github.com/softistx/riva/commit/97b6618c1afbdeb722207ee4eda99f2da7ab0f05) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Settle the public names of the simple API: the extensions, the GraphQL error and the call types. No old name is kept as an alias.
  
  **Breaking**
  
  | Old | New |
  |---|---|
  | `graphql(client)` (the extension of `@softistx/riva-graphql`) | `withGraphQL(client)` |
  | `rest(api)` / `rest({ baseUrl })` (the extension of `@softistx/riva-rest`) | `withRest(api)` / `withRest({ baseUrl })` |
  | `rest.query(...)` and `rest.mutation(...)` | the named `query(...)` and `mutation(...)` exports of `@softistx/riva-rest` |
  | `GraphQLError` | `RivaGraphQLError` |
  | `error.name === 'GraphQLError'` | `error.name === 'RivaGraphQLError'` (prefer `instanceof RivaGraphQLError`) |
  | `QueryCall` (riva-graphql) | `GraphQLQueryCall` |
  | `MutateCall` (riva-graphql) | `GraphQLMutateCall` |
  | `SubscribeCall` (riva-graphql) | `GraphQLSubscribeCall` |
  | `GetCall` (riva-rest) | `RestQueryCall` |
  | `MutateCall` (riva-rest) | `RestMutateCall` |
  | `VarsInput` (riva-graphql) and `InputArg` (riva-rest) | `TrackedInput`, defined in `@softistx/riva/resource` and re-exported by both adapters |
  
  `GraphQLErrorEntry` keeps its name. The client preset's `graphql()` document function is not renamed.

## 0.6.0

### Minor Changes

- [#91](https://github.com/softistx/riva/pull/91) [`45849d3`](https://github.com/softistx/riva/commit/45849d31ba3d245d22ef014bc79ab07f4a017fc6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Read the definition's `staleTime` under Suspense. `useQuery` and `suspenseStaleTime` (`@softistx/riva-react/resource`, now taking the definition as an optional third argument) trust the call's `staleTime`, else the definition's, else the riva's default, never less than 1000 ms; a definition with `staleTime: '5m'` no longer refetches on its first mount after Suspense. `@softistx/riva/resource` exports `toMs`, which riva-react now reuses instead of a private copy: an invalid duration string now throws `RIVA_DURATION` where the copy returned 0 (intended).

## 0.5.0

### Minor Changes

- [#89](https://github.com/softistx/riva/pull/89) [`295f932`](https://github.com/softistx/riva/commit/295f93265a3badddf9528903572c10b804b7de63) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Share what the adapters copied. `@softistx/riva/resource` exports `trackedInput`, `isReactive`, `abortable`, `callResource` and `mutateInvalidating` (typed over the definition's variables and data) and the `TrackedInput` and `CallOptions` types; `riva-graphql` and `riva-rest` use them for their calls. `riva-react/resource` adds `useCallResource`, which `useGraphQL` and `useRest` share. `useMutation` now reuses `mutationHandle`'s last-call-wins; one visible detail: passing a different mutation definition resets the hook to `idle` and a run still in flight from the previous one stops reporting. Otherwise no behaviour change.

## 0.4.0

No changes in this release.

## 0.3.0

### Minor Changes

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `riva.graphql.query` returns a `Resource` (reactive `state` and `subscribe`, tracked variables, `enabled`, `keepPrevious`) that is still awaitable: `await riva.graphql.query(...)` gives the data or throws. `riva.graphql.mutation(DOC)` returns a callable handle with a reactive `state` and `reset()`; `mutate` stays. A response with data and errors is the `error` state with the partial `data` kept; the error is a new `GraphQLError` (a `RivaRequestError`, defined in `@softistx/riva/resource` and re-exported by riva-graphql) listing the errors with their paths.
  
  Breaking, riva-graphql:
  
  - A bare `riva.graphql.query(...)` no longer fetches when it is called: it is lazy and fetches from its first subscriber or observed reader, or when awaited. Migration: `await riva.graphql.query(...)`, or `.subscribe(listener)`.
  - `riva.graphql.subscribe` returns a lazy stream resource instead of a `stop` function, and its callbacks are optional. Migration: `const off = riva.graphql.subscribe(DOC, vars, { next }).subscribe(() => {})`, then `off()` instead of `stop()`.
  - The `@softistx/riva` peer range is `^0.3.0` (it needs `@softistx/riva/resource`).

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@softistx/riva/resource`: `resource(riva, source, opts)` is a reactive, awaitable view of a query entry (tracked variables, `enabled`, `keepPrevious` with `placeholder`, lazy observation); `mutationHandle(riva, run)` gives a callable with a reactive `state` and `reset`; `streamResource(riva, source, opts)` turns an async-iterable factory into a resource. Breaking: the query status `pending` is now `loading` (also the status of `useMutation`; `isPending` stays). The adapters only rename the status.
  
  **Breaking:** the `useMutation` status `pending` is now `loading` (`riva-react`; `isPending` stays). Migration: compare `status === 'loading'` where you compared `'pending'`; the other adapters only re-export the renamed status.

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Breaking:** the deprecated aliases announced in 0.2.0 are removed. In `@softistx/riva`: `RivaClient`, `createRivaClient`, `setDefaultClient`, `ClientOptions` and `ClientEvents`. In `@softistx/riva-react`: `useClient` and the `client` prop of `RivaProvider`. In `@softistx/riva-react-router`: the `client` prop of `RivaRouterProvider`.
  
  Migration: `new RivaClient(...)` and `createRivaClient(...)` become `createRiva(...)`, `RivaClient` as a type becomes `Riva`, `setDefaultClient` becomes `setDefaultRiva`, `ClientOptions` becomes `RivaOptions`, `ClientEvents` becomes `RivaEvents`, `useClient()` becomes `useRiva()` and `<RivaProvider client={riva}>` becomes `<RivaProvider riva={riva}>` (the same for `RivaRouterProvider`).
  
  `createRiva` now refuses a misspelt option at the type level: a key that is not a `RivaOptions` key must be an extension, so `createRiva({ default: ... })` no longer compiles.

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `createRiva` takes named extensions (`RivaExtension`, `{ install(riva) }`), set on the instance as `riva[name]` and fully typed, and `defaults: { staleTime }`, the stale time of a query that sets none.

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `riva.graphql`: `createRiva({ graphql: graphql(client) })` gives `query`, `mutate` and `subscribe`, which take a typed document and its variables and return the data (cache, dedupe and derived keys included); `GraphQLTransport` gains an optional `subscribe`, implemented by `graphqlClientTransport`. The core's `EnsureOptions` gains `staleTime`, overriding the definition's and the riva's default for that call.

### Patch Changes

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - docs: the READMEs and guides lead with the simple API (`createRiva({ graphql, rest })`, `riva.graphql`, `riva.rest` and the hooks over them); definitions move to a new "Advanced: shared definitions" guide.

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `keepPrevious` never shows another key's data across a disabled gap: a resource that went `idle` (`enabled` false) and comes back under a new key shows `loading`, in the core `resource` and in `useResource`. A signal or computed passed as the variables or input of a hook is keyed by identity, so a change of its value fetches the new key once and does not reopen a stream (a function input still follows the render).
  
  **Breaking (types):** `useGraphQL` and `useRest` refuse `enabled` together with `suspense: true`, since a suspending hook has data or throws and is never `idle`; the non-suspense overload takes `suspense?: false`. Migration: drop `enabled` from a suspending call (render the component once its variables are known) or leave `suspense` off. `useResource` with `suspense` is typed `SuspendedState<D> | IdleState`.

## 0.2.0

### Minor Changes

- [#59](https://github.com/softistx/riva/pull/59) [`a8bfdf2`](https://github.com/softistx/riva/commit/a8bfdf207ec5387f73bc1512c029766c8fff3502) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `RivaClient` is renamed `Riva`: the instance holds local state too, so it is not a client.
  
  | Before | After |
  | --- | --- |
  | `RivaClient` | `Riva` |
  | `createRivaClient` | `createRiva` |
  | `ClientOptions`, `ClientEvents` | `RivaOptions`, `RivaEvents` |
  | `setDefaultClient` | `setDefaultRiva` |
  | `useClient` (riva-react) | `useRiva` |
  | `<RivaProvider client={client}>` | `<RivaProvider riva={riva}>` |
  | store action context `{ client, fetch, mutate }` | `{ riva, fetch, mutate }` |
  | `RivaRouterProvider` `client` prop | `riva` |
  | the `FetchContext` and free-fetcher context `client` | `riva` |
  
  Error messages follow: `No Riva in scope: wrap the tree in <RivaProvider riva={riva}>. On the server, create one per request.` Error codes are unchanged.
  
  The old names stay for one minor as deprecated aliases (the same references, so `instanceof` still holds): `RivaClient` (value and type), `createRivaClient`, `ClientOptions`, `ClientEvents`, `setDefaultClient`, `useClient`, and `RivaProvider` and `RivaRouterProvider` still accept `client`. They are removed in the next minor. `ctx.client` (store actions, `FetchContext`, free fetchers) gets no deprecated alias: read `ctx.riva`. Objects named `client` that are genuinely network clients (`@softistx/graphql-client`, httpyz and OpenAPI clients) keep their names.

### Patch Changes

- [#56](https://github.com/softistx/riva/pull/56) [`8ab68de`](https://github.com/softistx/riva/commit/8ab68dece6dce7e33e4891f9f05611991298bee6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Hydrating with `deferObserved` no longer writes an entry twice: an entry seeded on creation is taken out of the deferred snapshot, so its observer is notified once.

## 0.1.1

### Patch Changes

- [#51](https://github.com/softistx/riva/pull/51) [`2d37f07`](https://github.com/softistx/riva/commit/2d37f0738e219b1107bec37e4a5a7779034be7a7) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Store follow-ups. A store definition replaced by a hot reload no longer takes its name back when a component still holding it is read again: it resolves to the current instance, with no reset of the state (the server still refuses a duplicate name). The browser test is shared with the query entry (`'document' in globalThis`) and the `happy-dom`/`jsdom` case is documented. The limit of `useStore` for a `memo` child that alone reads a new key is documented, and a spec covers a render React discards leaving its keys uncommitted.

## 0.1.0

### Minor Changes

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add signals (`signal`, `computed`, `effect`, `batch`, `untracked`), the per-request `RivaClient` and the SSR scope guard (`RivaScopeError`).

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add the entity cache as the opt-in `@softistx/riva/entities` entry: `entities()` (a `cache` policy that normalizes query data into shared entities, with identity by `__typename` and `id`, `keys` or a custom `identify`, structural sharing and mark-and-sweep collection (cycles included)), `readEntity`, `writeEntity`, `evict`, `invalidateEntity` and `identifyOf`, and the `RIVA_CACHE` error. The main entry gains the `cache` query option and the `CachePolicy` type. A cache policy's `write`, `layer` and `commit` receive the operation's variables; `entities(opts, codec)` takes an `EntityCodec` (over an `EntityReader`) to normalize and denormalize differently, and `@softistx/riva/entities` exports `isPlain`, `isRef` and the types `EntityCodec`, `EntityReader`, `Normalized`, `Ref`. A plain read skips argument-field keys. An observed query whose stored data stops reading through its cache policy is refetched (and `ensure` fetches); a fetch whose result cannot be read back ends in the error status with `RIVA_CACHE` ("The cache cannot read the query's data after a fetch.") and `ensure` rejects, with no loop.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add cursor pagination as the opt-in `@softistx/riva/infinite` entry: `infinite()` defines a list whose data is the loaded pages, with `fetchNext`, `fetchPrevious`, a refetch of every loaded page, and `hasNext`, `hasPrevious` and the flattened `nodes` on the state. `Query` gains an optional state type, which `client.get` and `subscribe` return.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `mutation()` with an optimistic layer (keyed `tx.set` and `entities()` layers), rollback on failure, `updates` and `invalidates` on success, start-order settling per client, retry and abort. `CachePolicy` gains the optional `layer` and `commit` methods.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add the query engine: `query` definitions with `ensure`, `prefetch`, `invalidate`, `setData` and `cancel`, `client.get` and `client.subscribe` for queries, dedupe, `staleTime`, `gcTime`, retry with backoff, refetch on focus and reconnect, polling, abort end to end, injectable scheduler and events, duration strings (`"30s"`), stable cache keys (`stableKey`), and the request errors (`RivaRequestError`, `RivaHttpError`, `RivaNetworkError`, `RivaAbortError`). `client.subscribe(def, vars, listener, { staleTime })` lets an observer override the definition's `staleTime` for its first fetch decision only. Two definitions sharing an id are refused on the server with `RIVA_KEY` (in a browser the newest takes the entry over, for hot reload). `isRetryableStatus(status)` tells whether an HTTP status is worth retrying (5xx, 408, 429), and every adapter uses it.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `@softistx/riva/data`: `postData`, the browser's client of a `/_data` route (posts `{ id, variables }` in the SSR codec, reads `{ data }`, throws the route's errors as the core's classes), and the type `BffTransportOptions`; the main entry exports the `DataOperation` and `DataSource` types, the shape a `/_data` route's operations share between its adapters. The adapters' `bffTransport` share it.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `@softistx/riva/ssr`: `dehydrate(client)` makes a JSON-safe snapshot of the settled query entries and the named signals that opted in with `ssr: true`, `hydrate(client, snapshot)` seeds a client from it (entries and signals are seeded when their definition is first used, ages travel instead of clocks, fresh data is not refetched, `deferObserved` returns the observed entries to apply later), and `encode` / `decode` is the tagged codec (Dates, `NaN` and the infinities survive; a refused value throws `RIVA_SSR`). Errors travel as codes only and come back as their class by code. `setScopeResolver(fn)` (one per process) lets a host supply the ambient client. Dates in cached values round trip through a snapshot.
  
  `signal`'s `ssr` option defaults to `false`: a signal travels in a snapshot only with `ssr: true` and a `name`.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add domain stores as the opt-in `@softistx/riva/store` entry: `store({ name, ssr?, state, computed, actions })` groups a domain's state, computeds and actions. Each state key is a signal named `<name>.<key>` and each computed a riva computed, read as definitions; only actions write (batched, `s` stays bound to its client across `await`), and any other write throws `RIVA_STORE`. `ReadonlySignal` is a new type of the main entry. `@softistx/riva-react/store` adds `useStore(def)`, which returns `[s, a]` with `s` tracked per key.

### Patch Changes

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A guide page per area in each package's `docs/guide/`, a docs index, a troubleshooting entry per error, and READMEs that point to them.
