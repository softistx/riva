# Suspense

> Most call sites read GraphQL or REST with the hooks of the adapters (`useGraphQL`, `useRest`: see the [resource hooks](./resource.md)). This page covers the hook over a definition, for settings several call sites share: see [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md).

With `suspense: true`, `useQuery` suspends while there is no data, and `data` is no longer optional in its type. A failure with no data is thrown to the nearest error boundary. With `enabled: false` it never suspends: the query reads `idle`.

```tsx
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useQuery } from '@softistx/riva-react';

function PatientList({ school }: { school: string }) {
	const { data } = useQuery(patients, { school }, { suspense: true });
	return <ul>{data.map((p) => <li key={p.id}>{p.name}</li>)}</ul>; // data: Patient[]
}

export function Page({ school }: { school: string }) {
	return (
		<ErrorBoundary fallback={<p>Failed</p>}>
			<Suspense fallback={<p>Loading…</p>}>
				<PatientList school={school} />
			</Suspense>
		</ErrorBoundary>
	);
}
```

`ErrorBoundary` is the one of [react-error-boundary](https://www.npmjs.com/package/react-error-boundary); any error boundary works.

## Data that arrives in parts

A query whose fetch publishes parts with `ctx.onPart` (a GraphQL `@defer` or `@stream`, see [`@defer` and `@stream`](https://github.com/softistx/riva/blob/develop/packages/riva-graphql/docs/guide/incremental.md)) suspends only until its first part. The component then renders it, and later parts update `data` without suspending again. On the server the render waits for the whole result.

## Behaviour

- What a Suspense render fetched is not fetched again when the component mounts, whatever the query's `staleTime` (the hooks fetch with a `staleTime` of at least 1000 ms: the call's, else the definition's, else the riva's default; never below 1 s). An invalid duration string throws `RIVA_DURATION`.
- A suspended query's render keeps the entry observed until the component mounts and takes it over (however long the boundary waits on other children), so a live query's stream opens once. The handoff happens one tick after the component observes (StrictMode's remount never closes the stream). A failed fetch lets go at once; a component that never mounts lets go at the entry's `gcTime` (at most 5 minutes), on riva's scheduler.
- After an entity is evicted, a suspending component suspends again while the query refetches.
- On the server, `suspense: true` waits for the fetch and streams the result (`renderToReadableStream` and `renderToPipeableStream`).
- A failure with no data is thrown to the boundary. Resetting the boundary (a retry button, `resetErrorBoundary`) refetches it by itself and suspends on the new fetch; a new failure reaches the boundary again. `useResource` with `suspense` does the same.
- The retry happens in the browser only (the server always throws). An error is armed one task after its first throw: React's synchronous retry and StrictMode re-render it before that, so they never refetch. Any later read of the same error counts as a reset (a remount, a second boundary, a replayed render): it costs one extra fetch, never a loop.

## Traps

- Under fake timers the error is never armed, so a reset throws it again: advance the timers, or use real ones.
- A suspending query with no `staleTime` can fetch twice around the Suspense boundary: see [troubleshooting](../troubleshooting.md).
