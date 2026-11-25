# @softistx/riva-react docs

## Guides

- [Provider](./guide/provider.md): read first: `RivaProvider`, `useClient`, one client per tree.
- [Signals](./guide/signals.md): read for `useSignal` and `useValue` over signals and computeds.
- [Queries](./guide/queries.md): read for `useQuery`: options, result, `refetch`.
- [Suspense](./guide/suspense.md): read for `suspense: true`, error boundaries and retry.
- [Mutations](./guide/mutations.md): read for `useMutation`: status, `run`, `reset`.
- [Infinite lists](./guide/infinite.md): read for `useInfiniteQuery` and paging.
- [Entities](./guide/entities.md): read for `useFragment` over the normalized cache.
- [Stores](./guide/store.md): read for `useStore` and its tracked, read-only state.
- [Server rendering](./guide/ssr.md): read to render a request on the server.

## Reference

- [Troubleshooting](./troubleshooting.md): every error the bindings throw, and the traps (Suspense and error boundaries, stale data), with the fix.
- [Package README](../README.md): install, the provider, and one example per hook.
- [Core docs](https://github.com/softistx/riva/blob/develop/packages/riva/docs/README.md): the guides and errors of `@softistx/riva` itself.
- [Spec](https://github.com/softistx/riva/blob/develop/docs/spec.md): the decision record.
