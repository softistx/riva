# Suspense

> Most call sites read GraphQL or REST with the hooks of the adapters (`useGraphQL`, `useRest`: see the [resource hooks](./resource.md)). This page covers the hook over a definition, for settings several call sites share: see [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md).

With `suspense: true`, `useQuery` suspends while there is no data, and `data` is no longer optional in its type. A failure with no data is thrown to the nearest error boundary. With `enabled: false` it never suspends: the query reads `idle`.

```tsx
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useRiva, useQuery } from '@softistx/riva-react';

function PatientList({ school }: { school: string }) {
	const { data } = useQuery(patients, { school }, { suspense: true });
	return <ul>{data.map((p) => <li key={p.id}>{p.name}</li>)}</ul>; // data: Patient[]
}

export function Page({ school }: { school: string }) {
	const riva = useRiva();
	return (
		<ErrorBoundary fallback={<p>Failed</p>} onReset={() => patients.prefetch(riva, { school })}>
			<Suspense fallback={<p>Loading…</p>}>
				<PatientList school={school} />
			</Suspense>
		</ErrorBoundary>
	);
}
```

`ErrorBoundary` is the one of [react-error-boundary](https://www.npmjs.com/package/react-error-boundary); any error boundary works.

## Behaviour

- What a Suspense render fetched is not fetched again when the component mounts, whatever the query's `staleTime` (the hooks fetch with a `staleTime` of at least 1000 ms: the call's, else the definition's, else the riva's default; never below 1 s). An invalid duration string throws `RIVA_DURATION`.
- After an entity is evicted, a suspending component suspends again while the query refetches.
- On the server, `suspense: true` waits for the fetch and streams the result (`renderToReadableStream` and `renderToPipeableStream`).

## Traps

- To retry after an error, start the fetch again **before** resetting the boundary (`onReset={() => def.prefetch(riva, vars)}`), or the boundary re-renders the cached error: see [troubleshooting](../troubleshooting.md).
- A suspending query with no `staleTime` can fetch twice around the Suspense boundary: see [troubleshooting](../troubleshooting.md).
