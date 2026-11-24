# @softistx/riva-react

React bindings for [riva](../riva/README.md): a provider, hooks over atoms, queries, mutations, infinite lists and entities, and Suspense. Typed end to end: variables and data come from the definition, never from an annotation.

Errors and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).

```sh
bun add @softistx/riva @softistx/riva-react react
```

Peers: `react` ^19 and `@softistx/riva`. Every hook binds through `useSyncExternalStore`, so it is concurrent-safe and renders on the server.

## Provider

One `RivaClient` per tree: one in the browser, one per request on the server. A hook with no provider above it throws a `RivaScopeError` that names the fix.

```tsx
import { createRivaClient } from '@softistx/riva';
import { RivaProvider } from '@softistx/riva-react';

const client = createRivaClient(); // per request on the server

export const App = () => (
	<RivaProvider client={client}>
		<Patients />
	</RivaProvider>
);
```

`useClient()` returns the client, to call `def.invalidate(client, vars)` or `def.ensure(client, vars)` from an event handler.

## Atoms and computeds

```tsx
import { atom, computed } from '@softistx/riva';
import { useAtom, useValue } from '@softistx/riva-react';

const filter = atom('');
const hasFilter = computed((get) => get(filter).length > 0);

function Search() {
	const [q, setQ] = useAtom(filter); // setQ takes a value or an updater
	const active = useValue(hasFilter); // an atom or a computed
	return <input value={q} data-active={active} onChange={(e) => setQ(e.target.value)} />;
}
```

## Queries

`useQuery(def, vars?, opts?)` returns the query state (`status`, `data`, `error`, `isFetching`, `updatedAt`) plus `refetch`. It fetches while the component is mounted, when the data is missing or stale.

```tsx
import { query } from '@softistx/riva';
import { useQuery } from '@softistx/riva-react';

const patients = query<{ school: string }, Patient[]>({
	id: 'patients',
	staleTime: '30s',
	fetch: ({ school }, { signal }) => fetchPatients(school, signal),
});

function PatientList({ school }: { school: string }) {
	const { data, status, error, refetch } = useQuery(patients, { school });
	if (status === 'error') return <button onClick={refetch}>Retry: {String(error)}</button>;
	return <ul>{data?.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

- Variables are compared by value (`stableKey`), so an inline `{ school }` never resubscribes.
- `{ enabled: false }` observes nothing and reads `idle`.
- `refetch()` marks the entry stale and fetches it. It never rejects: the error is in the state.

## Suspense

With `suspense: true`, the component suspends while there is no data, and `data` is no longer optional in its type. A failure with no data is thrown to the nearest error boundary.

```tsx
function PatientList({ school }: { school: string }) {
	const { data } = useQuery(patients, { school }, { suspense: true });
	return <ul>{data.map((p) => <li key={p.id}>{p.name}</li>)}</ul>; // data: Patient[]
}

<ErrorBoundary fallback={<Failed />}>
	<Suspense fallback={<Spinner />}>
		<PatientList school="a" />
	</Suspense>
</ErrorBoundary>;
```

Give the query a `staleTime`: with the default `0`, the data a Suspense render just fetched is stale at once and is fetched again when the component mounts.

To retry after an error boundary, start the fetch again before resetting it: `patients.prefetch(client, { school })`, then reset the boundary.

## Mutations

`useMutation(def)` holds its status per hook instance. `run` resolves with the server data and rejects with the error (also in `error`); the mutation finishes even if the component unmounts, it only stops reporting. When runs overlap, the latest owns the state.

```tsx
import { mutation } from '@softistx/riva';
import { useMutation } from '@softistx/riva-react';

const rename = mutation<{ id: string; name: string }, Patient>({
	id: 'renamePatient',
	run: (vars, { signal }) => sendRename(vars, signal),
	invalidates: [patients],
});

function Rename({ id }: { id: string }) {
	const { run, isPending, error, reset } = useMutation(rename);
	return (
		<button disabled={isPending} onClick={() => run({ id, name: 'New name' }).catch(() => {})}>
			Rename
		</button>
	);
}
```

## Infinite lists

`@softistx/riva-react/infinite` binds a list built with `infinite()` from `@softistx/riva/infinite`.

```tsx
import { useInfiniteQuery } from '@softistx/riva-react/infinite';

function Feed({ school }: { school: string }) {
	const { data, hasNext, isFetchingNext, fetchNext } = useInfiniteQuery(patientsFeed, { school });
	return (
		<>
			<ul>{data?.nodes.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
			{hasNext && <button disabled={isFetchingNext} onClick={fetchNext}>More</button>}
		</>
	);
}
```

It also returns `fetchPrevious`, `hasPrevious`, `isFetchingPrevious` and `refetch` (every loaded page).

## Entities

`@softistx/riva-react/entities` reads one entity of the normalized cache (`@softistx/riva/entities`) by its ref. The component re-renders when that entity's fields change, and only then.

```tsx
import { useFragment } from '@softistx/riva-react/entities';

function PatientName({ id }: { id: string }) {
	const patient = useFragment<{ name: string }>(`Patient:${id}`);
	return <span>{patient?.name ?? '…'}</span>;
}
```

## Server rendering

Render each request under its own `RivaProvider` with its own client; no hook holds module-level state, so nothing leaks between requests.

- A hook never starts a fetch during a server render, except through `suspense: true`, which waits for it and streams the result (`renderToReadableStream` and `renderToPipeableStream`).
- Without Suspense, prefetch in the route loader (`def.ensure(client, vars)`) so the first render already has data.
- Effects and subscriptions run in the browser only.

## Entry points

| Import | Adds |
| --- | --- |
| `@softistx/riva-react` | `RivaProvider`, `useClient`, `useAtom`, `useValue`, `useQuery`, `useMutation` |
| `@softistx/riva-react/infinite` | `useInfiniteQuery` |
| `@softistx/riva-react/entities` | `useFragment` |

Core plus the main entry stays under 9 kB gzipped; the subpaths cost nothing until imported.
