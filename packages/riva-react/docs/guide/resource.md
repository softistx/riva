# Resource hooks

`@softistx/riva-react/resource` exports the blocks that `useGraphQL` and `useRest` are made of. Use them to wrap a resource of your own. The names below (`BOOKS_QUERY`, `ADD_BOOK_MUTATION`) are schematic.

## useResource

```ts
const state = useResource(key, (riva) => riva.graphql.query(BOOKS_QUERY, vars), { suspense, keepPrevious });
```

- One resource per riva and `key` (a string); it is stopped when the component unmounts. **The key identifies the resource: derive it from everything `make` reads.** `make` runs again only when the riva or the key changes.
- `state` is the resource state: `idle | loading | success | error`, with `isFetching` and `placeholder`. A fetch that settles with `undefined` is `success` with `data: undefined`.
- `keepPrevious` (default true) keeps the data of the previous key as a placeholder while the new one loads. It never carries data across a disabled gap: after the resource was `idle` (`enabled` false), a new key shows `loading`, not the old key's data.
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

`StableInput.input` is `unknown`, so a hook built on it casts it once, to the variables type (`as { first: number }` above). `useStableInput(id, input, enabled)` returns `{ key, input, enabled }`: the key to give `useResource`, and the input and `enabled` to hand the call. An inline `() => ({ first })` does not change the key at each render, only its result does. A function is evaluated at each render, untracked, to derive the key, so it follows props; the resource itself still tracks the signals the function reads. A signal or computed is keyed by identity, not by value: the resource tracks its value, so a change of it fetches the new key once and never rebuilds the resource (a stream is not reopened). Define a signal or computed once (at module level or in `useMemo`), never inline in render: a new one at each render is a new key, and under suspense a new suspension. Pass the signal itself rather than a function that only reads it; a function reading a signal changes the key at the next render, which can fetch the same key twice. While `enabled` is false the function is never called. Under suspense it is called once per render for the key.

## For adapter authors: useCallResource

`useCallResource(id, input, options, make)` is `useStableInput` and `useResource` together, what `useGraphQL` and `useRest` share. `id` names the operation, `options` are `{ suspense, keepPrevious, staleTime, enabled }`, and `make(riva, input, call)` builds the resource from the stabilised input and the call options (`enabled`, `keepPrevious`, and a `staleTime` raised to at least 1000 ms under Suspense).

- `CallResourceOptions`: what an adapter hook takes (`suspense`, `keepPrevious`, `staleTime`, `enabled`).
- `ResourceCall`: what `make` receives as `call` (`enabled`, and `keepPrevious` and `staleTime` when set).

```ts
import { callResource, trackedInput } from '@softistx/riva/resource';
import { useCallResource } from '@softistx/riva-react/resource';

// Schematic: `BOOKS_DEF` stands for your adapter's memoised `Query<unknown, unknown>`, so `input` (unknown) needs no cast.
const useBooks = (vars: unknown, options = {}) =>
	useCallResource('books', vars, options, (riva, input, call) =>
		callResource(riva, BOOKS_DEF, trackedInput(riva, input), call),
	);
```

## `suspense` and `enabled`

`useResource(..., { suspense: true })` is typed `SuspendedState<D> | IdleState`, since the resource it is given can be disabled. The hooks built on it (`useGraphQL`, `useRest`) refuse `enabled` with `suspense: true` at the type level: a suspending hook has data or throws, it is never `idle`. Use a plain hook, or render the component only once its variables are known.
