# @softistx/riva docs

The package's [README](../README.md) is the short path. These pages go deeper. The simple API (`riva.graphql`, `riva.rest`, the hooks) is documented with its adapters: [GraphQL](../../riva-graphql/docs/guide/simple-api.md), [REST](../../riva-rest/docs/guide/simple-api.md).

## Guides

| Page | Read it when |
|---|---|
| [Resources](./guide/resources.md) | You want the reactive, awaitable view the simple API returns: tracked variables, `enabled`, mutation handles and streams. |
| [Signals](./guide/signals.md) | You need local state, computeds, effects, batching or ambient reads. |
| [Stores](./guide/store.md) | You group a domain's state, computeds and actions. |
| [Server rendering](./guide/ssr.md) | You dehydrate, hydrate, or need the ambient scope on a server. |
| [Errors](./guide/errors.md) | You catch riva's errors by class and code. |
| [Data route riva](./guide/data.md) | You write a transport that posts to a `/_data` route. |

## Advanced: definitions

| Page | Read it when |
|---|---|
| [Shared definitions](./guide/shared-definitions.md) | You wonder whether a call site needs a definition: polling, optimistic updates, one freshness shared by several readers. |
| [Queries](./guide/queries.md) | You define a query and need every option: staleness, retry, abort, keys. |
| [Mutations](./guide/mutations.md) | You define a write: optimistic updates, rollback, ordering, invalidation. |
| [Entities](./guide/entities.md) | Queries share objects: the normalized cache, `writeEntity`, codecs. |
| [Infinite lists](./guide/infinite.md) | You paginate by cursor. |

## Also

- [Troubleshooting](./troubleshooting.md): every error riva throws, by its message, with the fix.
- [Roadmap](https://github.com/softistx/riva/blob/develop/docs/roadmap.md): what is next.
- [Spec](https://github.com/softistx/riva/blob/develop/docs/spec.md): the decision record.
