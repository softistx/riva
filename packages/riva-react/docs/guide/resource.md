# Resource hooks

`@softistx/riva-react/resource` exports the blocks that `useGraphQL` and `useRest` are made of. Use them to wrap a resource of your own.

## useResource

```ts
const state = useResource(key, (riva) => riva.graphql.query(DOC, vars), { suspense, keepPrevious });
```

- One resource per riva and `key` (a string); it is stopped when the component unmounts.
- `state` is the resource state: `idle | loading | success | error`, with `isFetching` and `placeholder`.
- `keepPrevious` (default true) keeps the data of the previous key as a placeholder while the new one loads.
- `suspense: true` suspends until data and types the state as success. Any error, a partial GraphQL one included, is thrown to the error boundary. A disabled (idle) resource does not suspend. The fetch of a Suspense mount uses a `staleTime` of 1000 ms, as `useQuery`.

## useMutationHandle

`useMutationHandle(key, (riva) => riva.rest.mutation('post', path))` returns a callable with the mutation state fields (`status`, `data`, `error`) and `reset()`.

## useStableInput

`useStableInput(id, input, enabled, suspense)` reads a plain value, a signal or a function through a stable wrapper, so an inline `() => ({ first })` does not change the key at each render. A function re-derives the key only through the signals it reads; to follow a prop, pass a plain value.
