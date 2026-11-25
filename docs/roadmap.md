# Roadmap

## Now

v1, on the integration branch `feat/v1`. What a consumer gets, slice by slice:

1. A monorepo of five packages that build, typecheck and test, with docs.
2. Signals, computeds and effects with automatic dependency tracking, values held per client, and a clear error when a server read has no client in scope.
3. Queries that dedupe in-flight requests, go stale, are garbage collected, retry sensibly, refetch on focus, and can be ensured, prefetched, invalidated and cancelled.
4. A normalized cache for GraphQL entities, aware of the selection (aliases, arguments, fragments), and a request-keyed cache for REST, with opt-in REST entities.
5. Mutations with optimistic updates that roll back on failure.
6. Cursor pagination and infinite lists over connections.
7. React bindings: a provider, hooks and Suspense support.
8. A GraphQL transport over `@softistx/graphql-client`, persisted ids and a codegen plugin that emits the allowlist manifest.
9. A REST transport typed by OpenAPI, plus a free fetcher for schema-less APIs.
10. React Router integration: one client per request, dehydrate and hydrate, the `/_data` route for BFF apps, an action-result helper and a revalidation bridge.
11. Domain stores: state, computeds and actions with `useStore`.
12. A guide for each package and a Claude Code plugin to adopt and upgrade riva.

## Next

- v1.1: subscriptions and server-sent events.
- v1.2: devtools to inspect the cache, signals and requests.

## Later

- v2: persistence and an offline mutation queue.
- Adapters for other frameworks, on demand.

## Not planned

Nothing yet.

## Shipped

Nothing yet.
