---
'@softistx/riva': minor
'@softistx/riva-graphql': minor
'@softistx/riva-rest': minor
'@softistx/riva-react': patch
'@softistx/riva-react-router': patch
---

Settle the public names of the simple API: the extensions, the GraphQL error and the call types. No old name is kept as an alias.

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
