# @softistx/riva-graphql

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

- [#53](https://github.com/softistx/riva/pull/53) [`053e72f`](https://github.com/softistx/riva/commit/053e72f4f2dcc06d62f218dc6daf7d55bf60b00f) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Accepts `@softistx/graphql-client` 0.11 as a peer.
- Updated dependencies [[`2d37f07`](https://github.com/softistx/riva/commit/2d37f0738e219b1107bec37e4a5a7779034be7a7)]:
  - @softistx/riva@0.1.1

## 0.1.0

### Minor Changes

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add `@softistx/riva-graphql/cache`: `normalized()`, a selection-aware normalized cache for `query(DOC, { cache: normalized() })` and `mutation`. It walks the operation's selection set (aliases, field arguments, inline and named fragments, `possibleTypes`) and stores entities in the core entity store, so `readEntity`, `writeEntity`, `useFragment` and optimistic layers keep working. `query()` and `mutation()` accept an `OperationCache`. A document with a missing `__typename` throws a `RivaError` with the `RIVA_DEFINITION` code.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add BFF mode: `@softistx/riva-graphql/bff`'s `bffTransport` posts `{ id, variables }` to a `/_data` route from the browser, and `@softistx/riva-graphql/server`'s `allowlist` runs the codegen manifest's operations on the server through the request client. Its `bffTransport` runs on `@softistx/riva/data`'s `postData`, and `BffTransportOptions` is re-exported from `/bff`. `allowlist()` takes the manifest as a JSON import (`AllowlistInput`, `kind` typed as a `string`) and checks each operation's kind at run time, refusing an unknown kind with a message that says to rerun the codegen.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add the GraphQL transport: `query`, `mutation` and the opt-in `@softistx/riva-graphql/infinite` entry's `infinite`, typed from a `TypedDocumentNode` with ids from the persisted hash or the operation name; `provideGraphQL` and `graphqlClientTransport` over `@softistx/graphql-client`, with its errors mapped to `RivaError`s; and `@softistx/riva-graphql/codegen`, which builds the allowlist manifest a BFF's `/_data` route reads from the client preset's `persisted-documents.json`, keeping its hash keys so ids match `__meta__.hash`. A misused definition (an unnamed or wrong-kind document) throws a `RivaError` with the `RIVA_DEFINITION` code.

### Patch Changes

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A guide page per area in each package's `docs/guide/`, a docs index, a troubleshooting entry per error, and READMEs that point to them.

- Accepts `@softistx/graphql-client` 0.10 as a peer.
- Updated dependencies [[`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9)]:
  - @softistx/riva@0.1.0
