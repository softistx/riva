---
'@softistx/riva': minor
'@softistx/riva-graphql': minor
---

`riva.graphql.query` returns a `Resource` (reactive `state` and `subscribe`, tracked variables, `enabled`, `keepPrevious`) that is still awaitable: `await riva.graphql.query(...)` gives the data or throws. `riva.graphql.mutation(DOC)` returns a callable handle with a reactive `state` and `reset()`; `mutate` stays. A response with data and errors is the `error` state with the partial `data` kept; the error is a new `GraphQLError` (a `RivaRequestError`, defined in `@softistx/riva/resource` and re-exported by riva-graphql) listing the errors with their paths.

Breaking, riva-graphql:

- A bare `riva.graphql.query(...)` no longer fetches when it is called: it is lazy and fetches from its first subscriber or observed reader, or when awaited. Migration: `await riva.graphql.query(...)`, or `.subscribe(listener)`.
- `riva.graphql.subscribe` returns a lazy stream resource instead of a `stop` function, and its callbacks are optional. Migration: `const off = riva.graphql.subscribe(DOC, vars, { next }).subscribe(() => {})`, then `off()` instead of `stop()`.
- The `@softistx/riva` peer range is `^0.3.0` (it needs `@softistx/riva/resource`).
