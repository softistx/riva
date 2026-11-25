---
'@softistx/riva-graphql': minor
---

`riva.graphql.query` returns a `Resource` (reactive `state` and `subscribe`, tracked variables, `enabled`, `keepPrevious`) that is still awaitable: `await riva.graphql.query(...)` gives the data or throws. `riva.graphql.mutation(DOC)` returns a callable handle with a reactive `state` and `reset()`; `mutate` stays. Breaking: `riva.graphql.subscribe` returns a lazy stream resource (open it with `subscribe(listener)`) instead of a `stop` function, and its callbacks are optional. A response with data and errors is the `error` state with the partial `data` kept; the error is a new `GraphQLError` (a `RivaRequestError`) listing the errors with their paths. Requires `@softistx/riva` with `@softistx/riva/resource`.
