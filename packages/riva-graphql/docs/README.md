# riva-graphql docs

The package's [README](../README.md) is the short path. These pages go deeper.

## Guides

| Page | Read it when |
|---|---|
| [Simple API](./guide/simple-api.md) | You call `riva.graphql.query / mutation / subscribe`, in code, loaders and components. Start here. |
| [Documents](./guide/documents.md) | You write the `graphql()` documents every call is built from, or a document is refused. |
| [Transport](./guide/transport.md) | You wire a riva to the API (`withGraphQL(client)`), or write a transport of your own. |
| [React hooks](../README.md#react-hooks) | You call the simple API from components (`useGraphQL`, `useGraphQLMutation`, `useGraphQLSubscription`). |
| [`@defer` and `@stream`](./guide/incremental.md) | A query should render its fast fields first and the rest as it arrives. |
| [Errors](./guide/errors.md) | You branch on a failure, or map errors in a transport. |
| [Allowlist codegen](./guide/codegen.md) | A BFF must execute only known documents. |
| [BFF mode](./guide/bff.md) | The browser must never send a document. |

## Advanced: shared definitions

| Page | Read it when |
|---|---|
| [Shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md) | You wonder when a `query()` or `mutation()` beats the simple call. |
| [Queries](./guide/queries.md) | You define a query and need its options (polling, `gcTime`, `retry`). |
| [Mutations](./guide/mutations.md) | You define a write with optimistic updates. |
| [Infinite lists](./guide/infinite.md) | You paginate a Relay connection. |
| [Normalized cache](./guide/cache.md) | Several queries show the same entity and must stay in step. |

## Also

| Page | Read it when |
|---|---|
| [Troubleshooting](./troubleshooting.md) | Every error message and `RivaError` code this package throws, with the fix. |
| [Roadmap](https://github.com/softistx/riva/blob/develop/docs/roadmap.md) | You want to know what is next. |
| [The core guides](https://github.com/softistx/riva/blob/develop/packages/riva/docs/README.md) | You need resources, signals or SSR of `@softistx/riva` itself. |
