# @softistx/riva docs

## Guides

- [Signals](./guide/signals.md): read when you need local state, computeds, effects, batching or ambient reads.
- [Queries](./guide/queries.md): read when you fetch and cache server data: options, staleness, retry, abort, keys.
- [Mutations](./guide/mutations.md): read when you write: optimistic updates, rollback, ordering, invalidation.
- [Entities](./guide/entities.md): read when queries share objects: the normalized cache, `writeEntity`, codecs.
- [Infinite lists](./guide/infinite.md): read for cursor pagination and infinite scroll.
- [Stores](./guide/store.md): read to group a domain's state, computeds and actions.
- [Server rendering](./guide/ssr.md): read for dehydrate, hydrate and the ambient scope on a server.
- [Data route client](./guide/data.md): read to write a transport that posts to a `/_data` route.
- [Errors](./guide/errors.md): read to catch riva's errors by class and code.

## Reference

- [Troubleshooting](./troubleshooting.md): every error riva throws, by its message, with the fix.
- [Package README](../README.md): install and one example per area.
- [Spec](https://github.com/softistx/riva/blob/develop/docs/spec.md): the decision record.
