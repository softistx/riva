# @softistx/riva-react docs

The package's [README](../README.md) is the short path. These pages go deeper. The hooks for GraphQL and REST (`useGraphQL`, `useRest`) live with their adapters: [GraphQL](../../riva-graphql/README.md#react-hooks), [REST](../../riva-rest/README.md#react-hooks).

## Guides

| Page | Read it when |
|---|---|
| [Provider](./guide/provider.md) | You start here: `RivaProvider`, `useRiva`, one riva per tree. |
| [Resource hooks](./guide/resource.md) | You build a hook over a resource, as `useGraphQL` and `useRest` do. |
| [Signals](./guide/signals.md) | You use `useSignal` and `useValue` over signals and computeds. |
| [Stores](./guide/store.md) | You use `useStore` and its tracked, read-only state. |
| [Server rendering](./guide/ssr.md) | You render a request on the server. |

## Advanced: hooks over definitions

| Page | Read it when |
|---|---|
| [Shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md) | You wonder whether a call site needs a definition at all. |
| [Queries](./guide/queries.md) | You use `useQuery`: options, result, `refetch`. |
| [Suspense](./guide/suspense.md) | You use `suspense: true`, error boundaries and retry. |
| [Mutations](./guide/mutations.md) | You use `useMutation`: status, `mutate`, `reset`. |
| [Infinite lists](./guide/infinite.md) | You use `useInfiniteQuery` and paging. |
| [Entities](./guide/entities.md) | You use `useFragment` over the normalized cache. |

## Also

- [Troubleshooting](./troubleshooting.md): every error the bindings throw, and the traps (Suspense and error boundaries, stale data), with the fix.
- [Roadmap](https://github.com/softistx/riva/blob/develop/docs/roadmap.md): what is next.
- [Core docs](https://github.com/softistx/riva/blob/develop/packages/riva/docs/README.md): the guides and errors of `@softistx/riva` itself.
- [Spec](https://github.com/softistx/riva/blob/develop/docs/spec.md): the decision record.
