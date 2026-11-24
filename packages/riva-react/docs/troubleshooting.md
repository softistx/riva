# Troubleshooting

Each entry is headed by the message you will see.

## No RivaClient in scope: wrap the tree in <RivaProvider client={client}>

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** a hook (`useAtom`, `useValue`, `useQuery`, `useMutation`, `useInfiniteQuery`, `useFragment` or `useClient`) rendered with no `RivaProvider` above it.

**Why:** definitions are stateless and values live in a `RivaClient`. The hooks take it from the provider, never from a module-level default, so two server requests can never share one.

**Fix:** wrap the tree in a provider. On the server, create the client per request.

```tsx
const client = createRivaClient(); // inside the request handler on the server
<RivaProvider client={client}>
	<App />
</RivaProvider>;
```

## A Suspense query fetches twice

**When:** a component using `useQuery(def, vars, { suspense: true })` suspends, renders, and the network shows a second request right after.

**Why:** `staleTime` defaults to `0`: the data the Suspense render just fetched is already stale when the component mounts and subscribes, so the engine fetches it again.

**Fix:** give the query a `staleTime`.

```ts
const patients = query({ id: 'patients', staleTime: '30s', fetch });
```

## The error boundary shows the error again after a reset

**When:** a `suspense: true` query failed, the boundary shows its fallback, and resetting the boundary shows the same error at once.

**Why:** the error is the query's state, and nothing refetches it: the component that would observe it was never mounted.

**Fix:** start the fetch again before resetting the boundary. The component then suspends and renders the new result.

```tsx
<ErrorBoundary
	onReset={() => patients.prefetch(client, { school })}
	fallbackRender={({ resetErrorBoundary }) => <button onClick={resetErrorBoundary}>Retry</button>}
>
	<Suspense fallback={<Spinner />}>
		<PatientList school={school} />
	</Suspense>
</ErrorBoundary>
```

## Unhandled rejection from `run`

**When:** `useMutation`'s `run(vars)` fails and the console reports an unhandled promise rejection.

**Why:** `run` rejects with the error, as the definition's own `run` does, besides setting `error` in the hook's state.

**Fix:** catch it where you call it, or read `error` and ignore the rejection.

```tsx
const { run, error } = useMutation(rename);
<button onClick={() => run({ id, name }).catch(() => {})}>Rename</button>;
```
