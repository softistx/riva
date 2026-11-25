# Resource hooks

`@softistx/riva-react/resource` exports the blocks that `useGraphQL` and `useRest` are made of. Use them to wrap a resource of your own. The names below (`BOOKS_QUERY`, `ADD_BOOK_MUTATION`) are schematic.

## useResource

```ts
const state = useResource(key, (riva) => riva.graphql.query(BOOKS_QUERY, vars), { suspense, keepPrevious });
```

- One resource per riva and `key` (a string); it is stopped when the component unmounts. **The key identifies the resource: derive it from everything `make` reads.** `make` runs again only when the riva or the key changes.
- `state` is the resource state: `idle | loading | success | error`, with `isFetching` and `placeholder`. A fetch that settles with `undefined` is `success` with `data: undefined`.
- `keepPrevious` (default true) keeps the data of the previous key as a placeholder while the new one loads.
- `suspense: true` suspends until data and types the state as success. Any error, a partial GraphQL one included, is thrown to the error boundary. A disabled (idle) resource does not suspend.
- Under suspense, give the call `staleTime: suspenseStaleTime(riva, yourStaleTime)`: at least 1000 ms (your value, else the riva's default, whichever is longer), so what the render just fetched is not fetched again at mount.

## useMutationHandle

```tsx
const save = useMutationHandle('add-book', (riva) => riva.graphql.mutation(ADD_BOOK_MUTATION));
<button onClick={() => save({ title: 'Dune' })}>Add</button>;
useEffect(() => {
	if (save.status === 'success') close(); // depend on the state
}, [save.status]); // never on `save` or `save.reset`
```

It returns a callable with the mutation state fields (`status`, `data`, `error`) and `reset()`; the state is `idle` on the server and at first render on the client. The callable and `reset` change identity with the state: call them from handlers, never put them in an effect's dependencies.

## useStableInput

```ts
const input = useStableInput('books', () => ({ first }), enabled);
const state = useResource(input.key, (riva) =>
	riva.graphql.query(BOOKS_QUERY, input.input as { first: number }, { enabled: input.enabled }),
);
```

`StableInput.input` is `unknown`, so a hook built on it casts it once, to the variables type (`as { first: number }` above). `useStableInput(id, input, enabled)` returns `{ key, input, enabled }`: the key to give `useResource`, and the input and `enabled` to hand the call. An inline `() => ({ first })` does not change the key at each render, only its result does. A function (or a signal) is evaluated at each render, untracked, to derive the key, so it follows props; the resource itself still tracks the signals the function reads. While `enabled` is false the function is never called. Under suspense it is called once per render for the key.
