---
'@softistx/riva': minor
'@softistx/riva-graphql': minor
---

`riva.graphql`: `createRiva({ graphql: graphql(client) })` gives `query`, `mutate` and `subscribe`, which take a typed document and its variables and return the data (cache, dedupe and derived keys included); `GraphQLTransport` gains an optional `subscribe`, implemented by `graphqlClientTransport`. The core's `EnsureOptions` gains `staleTime`, overriding the definition's and the riva's default for that call.
