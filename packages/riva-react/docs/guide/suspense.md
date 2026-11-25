# Suspense

With `suspense: true`, `useQuery` suspends while there is no data, and `data` is no longer optional in its type. A failure with no data is thrown to the nearest error boundary. With `enabled: false` it never suspends: the query reads `idle`.

```tsx
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useClient, useQuery } from '@softistx/riva-react';

function PatientList({ school }: { school: string }) {
	const { data } = useQuery(patients, { school }, { suspense: true });
	return <ul>{data.map((p) => <li key={p.id}>{p.name}</li>)}</ul>; // data: Patient[]
}

export function Page({ school }: { school: string }) {
	const client = useClient();
	return (
		<ErrorBoundary fallback={<p>Failed</p>} onReset={() => patients.prefetch(client, { school })}>
			<Suspense fallback={<p>Loading…</p>}>
				<PatientList school={school} />
			</Suspense>
		</ErrorBoundary>
	);
}
```

`ErrorBoundary` is the one of [react-error-boundary](https://www.npmjs.com/package/react-error-boundary); any error boundary works.

## Behaviour

- What a Suspense render fetched is not fetched again when the component mounts, whatever the query's `staleTime` (the hook subscribes with `{ staleTime: 1000 }`).
- After an entity is evicted, a suspending component suspends again while the query refetches.
- On the server, `suspense: true` waits for the fetch and streams the result (`renderToReadableStream` and `renderToPipeableStream`).

## Traps

- To retry after an error, start the fetch again **before** resetting the boundary (`onReset={() => def.prefetch(client, vars)}`), or the boundary re-renders the cached error: see [troubleshooting](../troubleshooting.md).
- A suspending query with no `staleTime` can fetch twice around the Suspense boundary: see [troubleshooting](../troubleshooting.md).
