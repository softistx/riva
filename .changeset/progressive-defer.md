---
'@softistx/riva': minor
'@softistx/riva-react': minor
'@softistx/riva-graphql': minor
---

A GraphQL query with `@defer` or `@stream` renders progressively through `useGraphQL` and `useQuery`: `data` is readable from the first part (`status: 'success'`, `isFetching: true`, `dataState: 'streaming'`), each part updates it, and `dataState` becomes `'complete'` at the end, with no loop in the component. The core's `FetchContext` gains `onPart(data)` and `QueryState` an optional `dataState`; a transport's `execute` receives `onPart` for a query, and `graphqlClientTransport` iterates `client.query(...)` for an incremental operation. With `normalized()` each part is merged into the cache, a field only a `@defer` fragment selects being left out until its part arrives. Suspense resolves at the first part in a browser. A plain query is unchanged.
