# riva-graphql docs

The package's [README](../README.md) is the short path. These pages go deeper.

## Guides

| Page | Read it when |
|---|---|
| [Documents](./guide/documents.md) | You write the `graphql()` documents a definition is built from, or a document is refused. |
| [Transport](./guide/transport.md) | You wire a riva to the API, or write a transport of your own. |
| [Simple API](./guide/simple-api.md) | You call `riva.graphql.query / mutation / subscribe` instead of defining. |
| [Queries](./guide/queries.md) | You define a query and need its options. |
| [Mutations](./guide/mutations.md) | You define a write, with optimistic updates or invalidation. |
| [Infinite lists](./guide/infinite.md) | You paginate a Relay connection. |
| [Normalized cache](./guide/cache.md) | Several queries show the same entity and must stay in step. |
| [Errors](./guide/errors.md) | You branch on a failure, or map errors in a transport. |
| [Allowlist codegen](./guide/codegen.md) | A BFF must execute only known documents. |
| [BFF mode](./guide/bff.md) | The browser must never send a document. |

## Also

- [Troubleshooting](./troubleshooting.md): every error message and `RivaError` code this package throws, with the fix.
- [The core guides](../../riva/docs/README.md).
