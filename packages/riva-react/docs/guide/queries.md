# Queries: `useQuery`

> Most call sites read GraphQL or REST with the hooks of the adapters (`useGraphQL`, `useRest`: see the [resource hooks](./resource.md)). This page covers the hook over a definition, for settings several call sites share: see [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md).

`useQuery(def, vars?, opts?)` returns the query state (`status`, `data`, `error`, `isFetching`, `updatedAt`, and `dataState` for a query that delivers its data in parts) plus `refetch`. It fetches while the component is mounted, when the data is missing or stale. Variables and data are inferred from the definition.

```tsx
import { query } from '@softistx/riva';
import { useQuery } from '@softistx/riva-react';

const patients = query({
	id: 'patients',
	staleTime: '30s',
	fetch: ({ school }: { school: string }, { signal }) => fetchPatients(school, signal), // Promise<Patient[]>
});

function PatientList({ school }: { school: string }) {
	const { data, status, error, refetch } = useQuery(patients, { school });
	if (status === 'error') return <button onClick={refetch}>Retry: {String(error)}</button>;
	return <ul>{data?.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

## Options (`opts`)

| Option | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | `false` observes nothing, creates no entry and reads `idle`. Use it for a query that waits on another value. |
| `suspense` | `false` | The component suspends while there is no data (see [suspense](./suspense.md)); the mount then honours the definition's `staleTime`, at least 1000 ms. |

## Result

`QueryResult<S>` is the definition's state plus `refetch: () => Promise<void>`.

- Variables are compared by value (`stableKey`), so an inline `{ school }` never resubscribes.
- `refetch()` marks the entry stale and fetches it. It never rejects: the error is in the state.
- A query with no required variables takes none: `useQuery(viewer)`.
- The definition's own options (`staleTime`, `gcTime`, `retry`, `refetchOnFocus`, `refetchEvery`, ...) decide how often it fetches: see the core's [queries guide](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/queries.md).

## Traps

- A hook never starts a fetch during a server render, except with `suspense: true`. Load data in a loader (`@softistx/riva-react-router`) or `ensure` it before rendering.
- `useQuery` observes: unmounting the last observer lets the entry be collected after `gcTime`.
