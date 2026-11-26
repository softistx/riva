---
'@softistx/riva-graphql': minor
'@softistx/riva-rest': minor
---

`riva.graphql.query`, `useGraphQL`, `riva.rest.get` and `useRest` also take a query definition (from `query(DOC)` or `query(api, route)`), used as is: a loader's `ensure` and the call or hook share one cache entry, and `invalidates: [def]` reaches it.
