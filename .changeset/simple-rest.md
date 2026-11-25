---
'@softistx/riva-rest': minor
---

`riva.rest`: `createRiva({ rest: rest(api) })` (an OpenAPI client) or `rest({ baseUrl })` gives `riva.rest.get`, `mutation`, `post`, `put`, `patch` and `delete`. The input is httpyz's `{ param, query, json }`, typed by the operations table, as a plain value, a riva signal or computed, or a tracked function. `get` returns an awaitable `Resource` (`enabled`, `keepPrevious`, `staleTime`, `signal`); `mutation(method, path)` returns a callable handle with a reactive `state` and `reset()`; the one-shot calls return the data. `invalidates` takes the paths of a `get`. Errors are riva's, as with the definitions. `rest({ baseUrl })` runs untyped over `fetch` (`riva.rest.get<T>(url)`).

Breaking: the `@softistx/riva` peer range is `^0.3.0` (it needs `@softistx/riva/resource`). Migration: update `@softistx/riva` to 0.3 with this package. `rest` (the export) is now a function that is also the old `{ query, mutation }` object: `rest.query` and `rest.mutation` work as before.
