# Roadmap

## Now

- **RxJS interop** — `@softistx/riva/rxjs` (`rxjs` ^7.8, an optional peer): riva states, queries and mutation handles as cold Observables of their full state (`toObservable`, `data$`), streams as keyed, cached, SSR-able queries (`liveQuery`), and `connect(riva, state, obs$)` to feed a state from an Observable. [#117](https://github.com/softistx/riva/issues/117), slices [#118](https://github.com/softistx/riva/issues/118), [#119](https://github.com/softistx/riva/issues/119), [#120](https://github.com/softistx/riva/issues/120)
- **Deprecate the graphql-client cache and React layer** — consumers of `@softistx/graphql-client` are pointed to riva for caching and React bindings, once riva has its first release.
- **Pilot in a BFF app** — riva run end to end in a server-rendered app with a backend-for-frontend, to validate the API before wider adoption.

## Next

- **REST entity shorthand** — identify REST entities with a short key function, like `(r) => r.id`, instead of spelling out `is` and `key`. [#24](https://github.com/softistx/riva/issues/24)
- **SSR hydration follow-ups** — deferred hydration no longer notifies an observer twice for the same data. [#31](https://github.com/softistx/riva/issues/31)
- **Store robustness** — hot reload keeps a store's state, stores behave the same on servers with DOM shims, and `useStore` sees a memoised child's reads. [#40](https://github.com/softistx/riva/issues/40)
- **Server-sent events** — a stream over SSE as a resource, beside the GraphQL subscriptions of the simple API.
- Devtools to inspect the cache, signals and requests.

## Later

- v2: persistence and an offline mutation queue.
- Adapters for other frameworks, on demand.

## Not planned

Nothing yet.

## Shipped

Landed in `develop`; released from 0.1.0 on, the simple API in the next minor release.

- Mutation handles call `mutate`, not `run`: the method is renamed to match the hooks' `mutate`, with no deprecated alias (breaking). 0.10.0. [#121](https://github.com/softistx/riva/issues/121)
- REST definitions from the generated operations table alone (0.10.0): `query(operations, 'get /invoices/{id}')` and `mutation(operations, 'post /invoices')` need no client, so a definition module imports only the generated table and the transport supplies the client at run time. The client form stays, and is the one to use for the JSON-typed data of a `decode: false` client. [#26](https://github.com/softistx/riva/issues/26)
- One entity store for GraphQL and REST: `normalized()`, `restEntities()` and `entities()` policies on one riva share its store, their `keys` merged per type. [#25](https://github.com/softistx/riva/issues/25)
- Each snapshot key emitted once per request: every loader may return `riva(context)`, and a later call of a request carries only the entries and signals not sent yet or changed since. [#36](https://github.com/softistx/riva/issues/36)
- Suspense error-boundary reset: resetting the error boundary of a failed Suspense query or resource retries it by itself, with no `onReset` workaround. [#19](https://github.com/softistx/riva/issues/19)
- Settled public names for 1.0: the extensions `withGraphQL` and `withRest`, the error `RivaGraphQLError`, call types that name their protocol (`GraphQLQueryCall`, `RestQueryCall`, …), one `TrackedInput`, one mutation-hook shape (`{ mutate, status, data, error, reset }` with a stable `mutate` and `reset`) and a path-first `useRest(path)`. No deprecated aliases.
- The simple API: one `createRiva({ graphql: withGraphQL(client), rest: withRest(api) })`, then `riva.graphql.query / mutation / subscribe` and `riva.rest.get / mutation` with derived keys, per-call options and `invalidates`, and hooks per namespace (`useGraphQL`, `useGraphQLMutation`, `useGraphQLSubscription`, `useRest`, `useRestMutation`).
- Reactive resources: tracked variables, an `enabled` option, built-in `idle / loading / success / error` states, previous data kept as a placeholder while the key changes, awaitable on the server, and mutation handles with their own state.
- A monorepo of five packages that build, typecheck and test, with docs.
- Signals, computeds and effects with automatic dependency tracking, values held per riva, and a clear error when a server read has no riva in scope.
- Queries that dedupe in-flight requests, go stale, are garbage collected, retry sensibly, refetch on focus, and can be ensured, prefetched, invalidated and cancelled.
- A normalized cache for GraphQL entities, aware of the selection (aliases, arguments, fragments), and a request-keyed cache for REST, with opt-in REST entities.
- Mutations with optimistic updates that roll back on failure.
- Cursor pagination and infinite lists over connections.
- React bindings: a provider, hooks and Suspense support.
- A GraphQL transport over `@softistx/graphql-client`, persisted ids and a codegen plugin that emits the allowlist manifest.
- A REST transport typed by OpenAPI, plus a free fetcher for schema-less APIs.
- React Router integration: one riva per request, dehydrate and hydrate, the `/_data` route for BFF apps, an action-result helper and a revalidation bridge.
- Domain stores: state, computeds and actions with `useStore`.
- A guide for each package and a Claude Code plugin to adopt and upgrade riva.
