# @softistx/riva-react

React bindings for [riva](https://github.com/softistx/riva/blob/develop/packages/riva/README.md): a provider, hooks over signals, queries, mutations, infinite lists and entities, and Suspense. Typed end to end: variables and data are inferred from the definition, never annotated at the call site.

Guides and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).

```sh
bun add @softistx/riva @softistx/riva-react react
```

Peers: `react` ^19 and `@softistx/riva`. Every hook binds through `useSyncExternalStore`, so it is concurrent-safe and renders on the server.

The examples are schematic: `Patient`, `fetchPatients`, `sendRename` and `fetchPatientPage` stand for your own types and transport functions.

## Provider

One `Riva` per tree: one in the browser, one per request on the server. A hook with no provider above it throws a `RivaScopeError` that names the fix.

```tsx
import { createRiva } from '@softistx/riva';
import { RivaProvider } from '@softistx/riva-react';

const riva = createRiva(); // per request on the server

export const App = () => (
	<RivaProvider riva={riva}>
		<Patients />
	</RivaProvider>
);
```

`useRiva()` returns the riva, to call `def.invalidate(riva, vars)` or `def.ensure(riva, vars)` from an event handler. [Guide](./docs/guide/provider.md).

## Signals and computeds

```tsx
import { signal, computed } from '@softistx/riva';
import { useSignal, useValue } from '@softistx/riva-react';

const filter = signal('');
const hasFilter = computed((get) => get(filter).length > 0);

function Search() {
	const [q, setQ] = useSignal(filter); // setQ takes a value or an updater
	const active = useValue(hasFilter); // a signal or a computed
	return <input value={q} data-active={active} onChange={(e) => setQ(e.target.value)} />;
}
```

[Guide](./docs/guide/signals.md).

## Queries

`useQuery(def, vars?, opts?)` returns the query state (`status`, `data`, `error`, `isFetching`, `updatedAt`) plus `refetch`. It fetches while the component is mounted, when the data is missing or stale. Variables and data are inferred from `fetch`.

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

Options: `enabled` (`true`) and `suspense` (`false`). Variables are compared by value, so an inline `{ school }` never resubscribes; `refetch()` never rejects. [Guide](./docs/guide/queries.md).

## Suspense

With `suspense: true`, the component suspends while there is no data, and `data` is no longer optional in its type. A failure with no data is thrown to the nearest error boundary. With `enabled: false` it never suspends: the query reads `idle`.

```tsx
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

function PatientList({ school }: { school: string }) {
	const { data } = useQuery(patients, { school }, { suspense: true });
	return <ul>{data.map((p) => <li key={p.id}>{p.name}</li>)}</ul>; // data: Patient[]
}

export const Page = ({ school }: { school: string }) => (
	<ErrorBoundary fallback={<p>Failed</p>}>
		<Suspense fallback={<p>Loading…</p>}>
			<PatientList school={school} />
		</Suspense>
	</ErrorBoundary>
);
```

To retry after an error, start the fetch again before resetting the boundary (`onReset={() => patients.prefetch(riva, { school })}`). [Guide](./docs/guide/suspense.md).

## Mutations

`useMutation(def)` holds its status per hook instance. `run` resolves with the server data and rejects with the error (also in `error`). [Guide](./docs/guide/mutations.md).

```tsx
import { mutation } from '@softistx/riva';
import { useMutation } from '@softistx/riva-react';

const rename = mutation({
	id: 'renamePatient',
	run: (vars: { id: string; name: string }, { signal }) => sendRename(vars, signal), // Promise<Patient>
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

`@softistx/riva-react/infinite` binds a list built with `infinite()` from `@softistx/riva/infinite`. `data.nodes` is every loaded page's nodes, flattened.

```tsx
import { infinite } from '@softistx/riva/infinite';
import { useInfiniteQuery } from '@softistx/riva-react/infinite';

const patientsFeed = infinite({
	id: 'patientsFeed',
	// `after` is the cursor the engine fills in; the caller passes `school` only.
	fetch: ({ school, after }: { school: string; after?: string }) => fetchPatientPage(school, after),
	// A page: { patients: { edges: [{ node: Patient, cursor }], pageInfo: { hasNextPage, endCursor, … } } }
	connection: (page) => page.patients,
});

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

It also returns `fetchPrevious`, `hasPrevious`, `isFetchingPrevious` and `refetch`. [Guide](./docs/guide/infinite.md).

## Stores

`@softistx/riva-react/store` binds a store built with `store()` from `@softistx/riva/store` (see the core README). `useStore(def)` returns `[s, a]`: `s` is the state and the computeds, `a` the actions bound to the provider's riva (stable for that riva).

```tsx
import { useStore } from '@softistx/riva-react/store';

function Books() {
	const [s, a] = useStore(BookStore);
	return (
		<>
			<input value={s.filter} onChange={(e) => a.filterBy(e.target.value)} />
			<p>{s.total} books</p>
			<ul>{s.visible.map((b) => <li key={b.title}>{b.title}</li>)}</ul>
			<button onClick={() => a.add({ title: 'New' })}>Add</button>
		</>
	);
}
```

`s` is tracked per key and read-only: a write throws `RIVA_STORE`; write through `a`. A key is watched once the component that called `useStore` has rendered it: a `memo` child that gets `s` as a prop and alone reads a new key is not watched for it until the parent renders again, so call `useStore` in that child (see [troubleshooting](./docs/troubleshooting.md)). [Guide](./docs/guide/store.md).

## Entities

`@softistx/riva-react/entities` reads one entity of the normalized cache by its ref (`Type:id`); the component re-renders when that entity changes, and only then. [Guide](./docs/guide/entities.md).

```tsx
import { useFragment } from '@softistx/riva-react/entities';

function PatientName({ id }: { id: string }) {
	const patient = useFragment<{ name: string }>(`Patient:${id}`);
	return <span>{patient?.name ?? '…'}</span>;
}
```

## Server rendering

Render each request under its own `RivaProvider` with its own riva; no hook holds module-level state, so nothing leaks between requests.

```tsx
import { createRiva } from '@softistx/riva';
import { RivaProvider } from '@softistx/riva-react';
import { renderToReadableStream } from 'react-dom/server';

export async function handle(school: string): Promise<Response> {
	const riva = createRiva(); // one per request
	await patients.ensure(riva, { school }); // so the first render has data
	const stream = await renderToReadableStream(
		<RivaProvider riva={riva}>
			<PatientList school={school} />
		</RivaProvider>,
	);
	return new Response(stream, { headers: { 'content-type': 'text/html' } });
}
```

A hook never starts a fetch during a server render, except through `suspense: true`. To hand the cache to the browser, use `@softistx/riva-react-router` or `dehydrate` and `hydrate`. [Guide](./docs/guide/ssr.md).

## Entry points

| Import | Adds |
| --- | --- |
| `@softistx/riva-react` | `RivaProvider`, `useRiva`, `useSignal`, `useValue`, `useQuery`, `useMutation` |
| `@softistx/riva-react/infinite` | `useInfiniteQuery` |
| `@softistx/riva-react/entities` | `useFragment` |
| `@softistx/riva-react/store` | `useStore` |

Types: `MutationResult` (what `useMutation` returns), `RivaProviderProps`, `SuspendedState` and `UseQueryOptions` (main entry), `InfiniteResult` and `UseInfiniteQueryOptions` (`/infinite`).

Core plus the main entry stays under 9 kB gzipped; the subpaths cost nothing until imported.
