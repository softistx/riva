# Troubleshooting

Each entry is headed by the message you will see.

## `No Riva in scope: wrap the tree in <RivaProvider riva={riva}>`

Code: `RIVA_SCOPE` (`RivaScopeError`).

The full message: `No Riva in scope: wrap the tree in <RivaProvider riva={riva}>. On the server, create one per request.`

**When:** a hook (`useSignal`, `useValue`, `useQuery`, `useMutation`, `useInfiniteQuery`, `useFragment` or `useRiva`) rendered with no `RivaProvider` above it.

**Why:** definitions are stateless and values live in a `Riva`. The hooks take it from the provider, never from a module-level default, so two server requests can never share one.

**Fix:** wrap the tree in a provider. On the server, create the riva per request.

```tsx
import { createRiva } from '@softistx/riva';
import { RivaProvider } from '@softistx/riva-react';

export const Root = () => (
	<RivaProvider riva={createRiva() /* inside the request handler on the server */}>
		<App />
	</RivaProvider>
);
```

This is not the core's "No Riva in scope: read through riva.get(def)…" error, which `signal.get()` and the like throw outside React: see the [core troubleshooting](https://github.com/softistx/riva/blob/develop/packages/riva/docs/troubleshooting.md#no-riva-in-scope).

## A query fetches twice around Suspense

**When:** you mount the same query once with `suspense: true` and once without (or under `Suspense` with `enabled` toggled), and the network shows a second request.

**Why:** a `suspense: true` mount trusts what a Suspense render just fetched, whatever the query's `staleTime`: the hooks fetch with a `staleTime` of at least 1000 ms (the call's, else the query's own, else the riva's default; never below 1 s, so a definition's `staleTime` of 5 minutes is honoured). A mount without it follows the query's own `staleTime`, `0` by default, so it fetches stale data again.

**Fix:** give the query a `staleTime`, or use `suspense: true` on every reader of that query.

```ts
const patients = query({ id: 'patients', staleTime: '30s', fetch });
```

## Unhandled rejection from `mutate`

**When:** `useMutation`'s `mutate(vars)` fails and the console reports an unhandled promise rejection.

**Why:** `mutate` rejects with the error, as the definition's own `mutate` does, besides setting `error` in the hook's state.

**Fix:** catch it where you call it, or read `error` and ignore the rejection.

```tsx
function Rename({ id, name }: { id: string; name: string }) {
	const { mutate, error } = useMutation(rename);
	return <button onClick={() => mutate({ id, name }).catch(() => {})}>Rename</button>;
}
```

## `isPending` is gone: read `status`

**When:** `useMutation` (or `useGraphQLMutation`, `useRestMutation`) no longer returns `isPending`, and `disabled={isPending}` is `undefined` or a type error.

**Why:** `status` is the one source of truth; `isPending` only repeated `status === 'loading'`.

**Fix:**

```tsx
const { mutate, status } = useMutation(rename);
<button disabled={status === 'loading'} onClick={() => mutate({ id, name }).catch(() => {})}>Rename</button>;
```

## `save` is now `mutate`, and it is stable

**When:** a mutation hook result is no longer callable (`add(vars)` is not a function).

**Why:** `useGraphQLMutation`, `useRestMutation` and `useMutation` all return `{ mutate, status, data, error, reset }`. `mutate` and `reset` keep their identity across renders, so they are safe in effect and memo dependencies. The handle of `riva.graphql.mutation()` and `riva.rest.mutation()` stays callable.

**Fix:**

```tsx
const { mutate: save, status } = useGraphQLMutation(ADD_BOOK_MUTATION);
await save({ title: 'Dune' }, { invalidates: [BOOKS_QUERY] });
```

## `Store "<name>": "<key>" is read-only here; write it in an action.`

Code: `RIVA_STORE` (`RivaError`).

**When:** a component assigns to the `s` that `useStore(def)` returns (`s.filter = 'x'`).

**Why:** `s` is a read-only, tracked view of the store's state and computeds: the component re-renders only when a key it read changes. Only the store's actions write.

**Fix:** call the action from `a`.

```tsx
const [s, a] = useStore(BookStore);
a.filterBy('x'); // not s.filter = 'x'
```

## A memoised child does not update for a key only it reads

**When:** a `React.memo` child receives `s` as a prop, and the child alone re-renders (its own state) and reads a key the parent has never read. Changing that key does not update the child.

**Why:** `s` tracks the keys a component reads, and commits them in the layout effect of the component that called `useStore`. A child has no hook of its own, so a key only it reads stays uncommitted until the parent next renders. Committing from the child's reads would also commit the keys of a render React discards.

**Fix:** read the key in the component that calls `useStore` (and pass the value down), or call `useStore(def)` in the child.

```tsx
const Child = memo(function Child() {
	const [s] = useStore(BookStore); // its own hook, its own keys
	return <i>{s.filter}</i>;
});
```

## `` useResource: `suspense` needs an awaitable resource, not a stream. ``

**When:** `suspense: true` on a hook whose `make` returned a stream resource (a subscription), which has no `then`.

**Why:** Suspense needs a promise; a stream never settles.

**Fix:** read it without `suspense`.

```ts
const feed = useGraphQLSubscription(BOOK_ADDED_SUBSCRIPTION, {}); // no suspense option
```
