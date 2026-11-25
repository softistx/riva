# Troubleshooting

Each entry is headed by the message you will see.

## `No RivaClient in scope: wrap the tree in <RivaProvider client={client}>`

Code: `RIVA_SCOPE` (`RivaScopeError`).

The full message: `No RivaClient in scope: wrap the tree in <RivaProvider client={client}>. On the server, create one client per request.`

**When:** a hook (`useSignal`, `useValue`, `useQuery`, `useMutation`, `useInfiniteQuery`, `useFragment` or `useClient`) rendered with no `RivaProvider` above it.

**Why:** definitions are stateless and values live in a `RivaClient`. The hooks take it from the provider, never from a module-level default, so two server requests can never share one.

**Fix:** wrap the tree in a provider. On the server, create the client per request.

```tsx
import { createRivaClient } from '@softistx/riva';
import { RivaProvider } from '@softistx/riva-react';

export const Root = () => (
	<RivaProvider client={createRivaClient() /* inside the request handler on the server */}>
		<App />
	</RivaProvider>
);
```

This is not the core's "No RivaClient in scope: read through client.get(def)…" error, which `signal.get()` and the like throw outside React: see the [core troubleshooting](https://github.com/softistx/riva/blob/develop/packages/riva/docs/troubleshooting.md#no-rivaclient-in-scope).

## A query fetches twice around Suspense

**When:** you mount the same query once with `suspense: true` and once without (or under `Suspense` with `enabled` toggled), and the network shows a second request.

**Why:** a `suspense: true` mount trusts what a Suspense render just fetched for one second, whatever the query's `staleTime`. A mount without it follows the query's own `staleTime`, `0` by default, so it fetches stale data again.

**Fix:** give the query a `staleTime`, or use `suspense: true` on every reader of that query.

```ts
const patients = query({ id: 'patients', staleTime: '30s', fetch });
```

## The error boundary shows the error again after a reset

**When:** a `suspense: true` query failed, the boundary shows its fallback, and resetting the boundary shows the same error at once.

**Why:** the error is the query's state, and nothing refetches it: the component that would observe it was never mounted.

**Fix:** start the fetch again before resetting the boundary. The component then suspends and renders the new result.

```tsx
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useClient } from '@softistx/riva-react';

export function Page({ school }: { school: string }) {
	const client = useClient();
	return (
		<ErrorBoundary
			onReset={() => patients.prefetch(client, { school })}
			fallbackRender={({ resetErrorBoundary }) => (
				<button onClick={resetErrorBoundary}>Retry</button>
			)}
		>
			<Suspense fallback={<p>Loading…</p>}>
				<PatientList school={school} />
			</Suspense>
		</ErrorBoundary>
	);
}
```

`ErrorBoundary` is the one of [react-error-boundary](https://www.npmjs.com/package/react-error-boundary).

## Unhandled rejection from `run`

**When:** `useMutation`'s `run(vars)` fails and the console reports an unhandled promise rejection.

**Why:** `run` rejects with the error, as the definition's own `run` does, besides setting `error` in the hook's state.

**Fix:** catch it where you call it, or read `error` and ignore the rejection.

```tsx
function Rename({ id, name }: { id: string; name: string }) {
	const { run, error } = useMutation(rename);
	return <button onClick={() => run({ id, name }).catch(() => {})}>Rename</button>;
}
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
