# @softistx/riva-react-router

## 0.12.0

### Patch Changes

- Updated dependencies [[`efdd7eb`](https://github.com/softistx/riva/commit/efdd7eb01c56661020ebe780e178d4603feae55a), [`b5ca9e9`](https://github.com/softistx/riva/commit/b5ca9e991b7acbff1d60636fd9e4cfb88459f358)]:
  - @softistx/riva@0.12.0
  - @softistx/riva-react@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [[`52fc5c6`](https://github.com/softistx/riva/commit/52fc5c63d6888f34885384b3daa98e6758e83199), [`52fc5c6`](https://github.com/softistx/riva/commit/52fc5c63d6888f34885384b3daa98e6758e83199), [`52fc5c6`](https://github.com/softistx/riva/commit/52fc5c63d6888f34885384b3daa98e6758e83199), [`52fc5c6`](https://github.com/softistx/riva/commit/52fc5c63d6888f34885384b3daa98e6758e83199)]:
  - @softistx/riva@0.11.0
  - @softistx/riva-react@0.11.0

## 0.10.0

### Minor Changes

- [#122](https://github.com/softistx/riva/pull/122) [`d81a3fa`](https://github.com/softistx/riva/commit/d81a3fa1448000a1ff74aad231877ec189afa3c3) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Breaking: a mutation's `run` is now `mutate`, with no alias. The option, the definition method and the hooks' result are renamed together; `riva.run(() => …)` (the scope runner) and the `/_data` operations' `run` are unchanged.
  
  Migration:
  
  - `def.run(riva, vars)` becomes `def.mutate(riva, vars)` (core, `riva.graphql.mutation`, `riva.rest.mutation`).
  - `mutation({ id, run })` becomes `mutation({ id, mutate })` (core and the REST free form).
  - `const { run } = useMutation(def)` becomes `const { mutate } = useMutation(def)`; the same for `useGraphQLMutation`, `useRestMutation` and `useMutationHandle`.
  - `mutationHandle(riva, run)` keeps its shape; only the parameter is named `mutate`.

### Patch Changes

- [#112](https://github.com/softistx/riva/pull/112) [`e515cdb`](https://github.com/softistx/riva/commit/e515cdbbd10f5a90d3d8a68cc68ff2195f45b3d8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Replaced store definitions are remembered weakly so they can be collected, the never-held-definition limit is documented, and the router provider tests the browser like the core does.
- Updated dependencies [[`d81a3fa`](https://github.com/softistx/riva/commit/d81a3fa1448000a1ff74aad231877ec189afa3c3), [`8327261`](https://github.com/softistx/riva/commit/8327261143ea900dfcf5da72f4f2d2cdf1fc16ec), [`e515cdb`](https://github.com/softistx/riva/commit/e515cdbbd10f5a90d3d8a68cc68ff2195f45b3d8)]:
  - @softistx/riva@0.10.0
  - @softistx/riva-react@0.10.0

## 0.9.0

### Minor Changes

- [#110](https://github.com/softistx/riva/pull/110) [`031e4c5`](https://github.com/softistx/riva/commit/031e4c5df2a8940ce28dc1f2ac7f2e28c4ca49be) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `riva(context)` emits each snapshot key once per request: the first call holds the whole request riva, a later call only the entries and signals not emitted yet or changed since. Every loader that needs it can now return `riva(context)` without repeating data in the hydration payload. A later `riva()` call in a request is no longer a full snapshot, so code that reads one route's `loaderData['~riva']` alone may not see everything.

### Patch Changes

- [#109](https://github.com/softistx/riva/pull/109) [`613ad02`](https://github.com/softistx/riva/commit/613ad0289c60690956c24d86f234c7a784baf6c7) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Accept `@softistx/alxia-react-router` 0.84 to 0.86 as the optional peer (it was `^0.83.1` only, so hosts on 0.86 saw a peer warning).
- Updated dependencies []:
  - @softistx/riva@0.9.0
  - @softistx/riva-react@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [[`afa8bc9`](https://github.com/softistx/riva/commit/afa8bc94aa29319cd5788612f0416c8f38b61256)]:
  - @softistx/riva-react@0.8.0
  - @softistx/riva@0.8.0

## 0.7.2

### Patch Changes

- Updated dependencies [[`7ea2dee`](https://github.com/softistx/riva/commit/7ea2dee5a79a0372a9a7142f8d9321c2f66eb1cb)]:
  - @softistx/riva@0.7.2
  - @softistx/riva-react@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @softistx/riva@0.7.1
  - @softistx/riva-react@0.7.1

## 0.7.0

### Patch Changes

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
- Updated dependencies [[`97b6618`](https://github.com/softistx/riva/commit/97b6618c1afbdeb722207ee4eda99f2da7ab0f05), [`97b6618`](https://github.com/softistx/riva/commit/97b6618c1afbdeb722207ee4eda99f2da7ab0f05)]:
  - @softistx/riva@0.7.0
  - @softistx/riva-react@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`45849d3`](https://github.com/softistx/riva/commit/45849d31ba3d245d22ef014bc79ab07f4a017fc6)]:
  - @softistx/riva@0.6.0
  - @softistx/riva-react@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [[`295f932`](https://github.com/softistx/riva/commit/295f93265a3badddf9528903572c10b804b7de63)]:
  - @softistx/riva@0.5.0
  - @softistx/riva-react@0.5.0

## 0.4.0

### Minor Changes

- [#87](https://github.com/softistx/riva/pull/87) [`a1c3691`](https://github.com/softistx/riva/commit/a1c3691e6be18fd6116b2eadcb3fdd00763b59f4) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Type `rivaOf` by your app's riva with a `Register` module augmentation, so `.graphql` and `.rest` need no cast.

### Patch Changes

- Updated dependencies []:
  - @softistx/riva@0.4.0
  - @softistx/riva-react@0.4.0

## 0.3.0

### Minor Changes

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@softistx/riva/resource`: `resource(riva, source, opts)` is a reactive, awaitable view of a query entry (tracked variables, `enabled`, `keepPrevious` with `placeholder`, lazy observation); `mutationHandle(riva, run)` gives a callable with a reactive `state` and `reset`; `streamResource(riva, source, opts)` turns an async-iterable factory into a resource. Breaking: the query status `pending` is now `loading` (also the status of `useMutation`; `isPending` stays). The adapters only rename the status.
  
  **Breaking:** the `useMutation` status `pending` is now `loading` (`riva-react`; `isPending` stays). Migration: compare `status === 'loading'` where you compared `'pending'`; the other adapters only re-export the renamed status.

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Breaking:** the deprecated aliases announced in 0.2.0 are removed. In `@softistx/riva`: `RivaClient`, `createRivaClient`, `setDefaultClient`, `ClientOptions` and `ClientEvents`. In `@softistx/riva-react`: `useClient` and the `client` prop of `RivaProvider`. In `@softistx/riva-react-router`: the `client` prop of `RivaRouterProvider`.
  
  Migration: `new RivaClient(...)` and `createRivaClient(...)` become `createRiva(...)`, `RivaClient` as a type becomes `Riva`, `setDefaultClient` becomes `setDefaultRiva`, `ClientOptions` becomes `RivaOptions`, `ClientEvents` becomes `RivaEvents`, `useClient()` becomes `useRiva()` and `<RivaProvider client={riva}>` becomes `<RivaProvider riva={riva}>` (the same for `RivaRouterProvider`).
  
  `createRiva` now refuses a misspelt option at the type level: a key that is not a `RivaOptions` key must be an extension, so `createRiva({ default: ... })` no longer compiles.

### Patch Changes

- [#80](https://github.com/softistx/riva/pull/80) [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea) Thanks [@SteveGT96](https://github.com/SteveGT96)! - docs: the READMEs and guides lead with the simple API (`createRiva({ graphql, rest })`, `riva.graphql`, `riva.rest` and the hooks over them); definitions move to a new "Advanced: shared definitions" guide.
- Updated dependencies [[`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea), [`4a769da`](https://github.com/softistx/riva/commit/4a769da68f661b307fe475c79c74a131a285bfea)]:
  - @softistx/riva@0.3.0
  - @softistx/riva-react@0.3.0

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
  - @softistx/riva-react@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`2d37f07`](https://github.com/softistx/riva/commit/2d37f0738e219b1107bec37e4a5a7779034be7a7)]:
  - @softistx/riva@0.1.1
  - @softistx/riva-react@0.1.1

## 0.1.0

### Minor Changes

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `dataRoute` (`/server`), the `/_data` action that runs allowlisted operations for the browser with the request's session, and `useActionResult`, `revalidate` and the provider's `invalidateOnAction` to keep queries fresh after an action.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add the React Router host: `rivaMiddleware` (from `/server`) makes one `RivaClient` per request and sets it as the ambient scope of the whole request, `rivaOf(context)` and `riva(context)` read it and put its snapshot in loader data under `~riva`, and `RivaRouterProvider` hydrates each match's snapshot (the first render before its children, later ones without touching observed entries during a render) and renders `RivaProvider`. A request with no middleware throws `RIVA_SCOPE`.

### Patch Changes

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A guide page per area in each package's `docs/guide/`, a docs index, a troubleshooting entry per error, and READMEs that point to them.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add BFF mode for REST: `@softistx/riva-rest/bff`'s `bffTransport` posts `{ id: 'rest:<operationId>', variables }` to a `/_data` route from the browser (errors come back as the core's classes), and `@softistx/riva-rest/server`'s `operations(api)` runs the spec's operations on the server through the request client's REST transport. In the browser a free fetcher that reads `http` throws `RivaScopeError` naming server-only use. `bffTransport` runs on `@softistx/riva/data`'s `postData`, and `BffTransportOptions` is re-exported from `/bff`.
- Updated dependencies [[`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9)]:
  - @softistx/riva@0.1.0
  - @softistx/riva-react@0.1.0
