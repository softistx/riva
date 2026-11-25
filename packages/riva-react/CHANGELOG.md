# @softistx/riva-react

## 0.3.0

### Minor Changes

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Hooks per namespace. `@softistx/riva-graphql/react` adds `useGraphQL(DOC, vars, opts)`, `useGraphQLMutation(DOC)` and `useGraphQLSubscription(DOC, vars, opts)`; `@softistx/riva-rest/react` adds `useRest('get', path, input, opts)` and `useRestMutation(method, path)` (typed by augmenting the `Register` interface with the operations table). They return the resource state (`idle | loading | success | error`); mutations also return the callable handle with `reset`. `{ suspense: true }` suspends until data and types the state as success. `enabled`, function variables and `keepPrevious` work as on `riva.graphql` and `riva.rest`; a server render reads the request's riva, seeds and dehydrates, and hydration does not refetch fresh data.
  
  `@softistx/riva-react/resource` is a new subpath with the generic building blocks the adapters use: `useResource`, `useMutationHandle`, `useStableInput` and `suspenseStaleTime`. The main entry is unchanged. Function variables and `enabled` are evaluated at each render, so they follow props as well as signals. Under `suspense` the fetch uses a `staleTime` of at least 1000 ms (the call's, else the riva's default, whichever is longer). A mutation hook's callable and `reset` change identity with the state: call them from handlers, not from effect dependencies.
  
  `react` and `@softistx/riva-react` are optional peers of the two adapters (`^19` and `^0.3.0`); `@softistx/riva-react` now peers on `@softistx/riva` `^0.3.0`.

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@softistx/riva/resource`: `resource(riva, source, opts)` is a reactive, awaitable view of a query entry (tracked variables, `enabled`, `keepPrevious` with `placeholder`, lazy observation); `mutationHandle(riva, run)` gives a callable with a reactive `state` and `reset`; `streamResource(riva, source, opts)` turns an async-iterable factory into a resource. Breaking: the query status `pending` is now `loading` (also the status of `useMutation`; `isPending` stays). The adapters only rename the status.
  
  **Breaking:** the `useMutation` status `pending` is now `loading` (`riva-react`; `isPending` stays). Migration: compare `status === 'loading'` where you compared `'pending'`; the other adapters only re-export the renamed status.

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Breaking:** the deprecated aliases announced in 0.2.0 are removed. In `@softistx/riva`: `RivaClient`, `createRivaClient`, `setDefaultClient`, `ClientOptions` and `ClientEvents`. In `@softistx/riva-react`: `useClient` and the `client` prop of `RivaProvider`. In `@softistx/riva-react-router`: the `client` prop of `RivaRouterProvider`.
  
  Migration: `new RivaClient(...)` and `createRivaClient(...)` become `createRiva(...)`, `RivaClient` as a type becomes `Riva`, `setDefaultClient` becomes `setDefaultRiva`, `ClientOptions` becomes `RivaOptions`, `ClientEvents` becomes `RivaEvents`, `useClient()` becomes `useRiva()` and `<RivaProvider client={riva}>` becomes `<RivaProvider riva={riva}>` (the same for `RivaRouterProvider`).
  
  `createRiva` now refuses a misspelt option at the type level: a key that is not a `RivaOptions` key must be an extension, so `createRiva({ default: ... })` no longer compiles.

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `keepPrevious` never shows another key's data across a disabled gap: a resource that went `idle` (`enabled` false) and comes back under a new key shows `loading`, in the core `resource` and in `useResource`. A signal or computed passed as the variables or input of a hook is keyed by identity, so a change of its value fetches the new key once and does not reopen a stream (a function input still follows the render).
  
  **Breaking (types):** `useGraphQL` and `useRest` refuse `enabled` together with `suspense: true`, since a suspending hook has data or throws and is never `idle`; the non-suspense overload takes `suspense?: false`. Migration: drop `enabled` from a suspending call (render the component once its variables are known) or leave `suspense` off. `useResource` with `suspense` is typed `SuspendedState<D> | IdleState`.

### Patch Changes

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - docs: the READMEs and guides lead with the simple API (`createRiva({ graphql, rest })`, `riva.graphql`, `riva.rest` and the hooks over them); definitions move to a new "Advanced: shared definitions" guide.
- Updated dependencies [[`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea)]:
  - @softistx/riva@0.3.0

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

- Updated dependencies [[`a8bfdf2`](https://github.com/softistx/riva/commit/a8bfdf207ec5387f73bc1512c029766c8fff3502), [`8ab68de`](https://github.com/softistx/riva/commit/8ab68dece6dce7e33e4891f9f05611991298bee6)]:
  - @softistx/riva@0.2.0

## 0.1.1

### Patch Changes

- [#51](https://github.com/softistx/riva/pull/51) [`2d37f07`](https://github.com/softistx/riva/commit/2d37f0738e219b1107bec37e4a5a7779034be7a7) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Store follow-ups. A store definition replaced by a hot reload no longer takes its name back when a component still holding it is read again: it resolves to the current instance, with no reset of the state (the server still refuses a duplicate name). The browser test is shared with the query entry (`'document' in globalThis`) and the `happy-dom`/`jsdom` case is documented. The limit of `useStore` for a `memo` child that alone reads a new key is documented, and a spec covers a render React discards leaving its keys uncommitted.
- Updated dependencies [[`2d37f07`](https://github.com/softistx/riva/commit/2d37f0738e219b1107bec37e4a5a7779034be7a7)]:
  - @softistx/riva@0.1.1

## 0.1.0

### Minor Changes

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add the React bindings: `RivaProvider` and `useClient`, `useSignal` and `useValue`, `useQuery` (with `enabled` and Suspense, `data` non-optional under `suspense: true`, and `refetch`), `useMutation`, plus the opt-in `@softistx/riva-react/infinite` (`useInfiniteQuery`) and `@softistx/riva-react/entities` (`useFragment`) entries. Every hook binds through `useSyncExternalStore` and renders on the server, with one client per request.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add domain stores as the opt-in `@softistx/riva/store` entry: `store({ name, ssr?, state, computed, actions })` groups a domain's state, computeds and actions. Each state key is a signal named `<name>.<key>` and each computed a riva computed, read as definitions; only actions write (batched, `s` stays bound to its client across `await`), and any other write throws `RIVA_STORE`. `ReadonlySignal` is a new type of the main entry. `@softistx/riva-react/store` adds `useStore(def)`, which returns `[s, a]` with `s` tracked per key.

### Patch Changes

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A guide page per area in each package's `docs/guide/`, a docs index, a troubleshooting entry per error, and READMEs that point to them.
- Updated dependencies [[`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9)]:
  - @softistx/riva@0.1.0
