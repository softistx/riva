# @softistx/riva-react

React bindings for [riva](https://github.com/softistx/riva/blob/develop/packages/riva/README.md): a provider, hooks over signals, queries, mutations, infinite lists and entities, and Suspense. Typed end to end: variables and data are inferred from the definition, never annotated at the call site.

Errors and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).

```sh
bun add @softistx/riva @softistx/riva-react react
```

Peers: `react` ^19 and `@softistx/riva`. Every hook binds through `useSyncExternalStore`, so it is concurrent-safe and renders on the server.

The examples are schematic: `Patient`, `fetchPatients`, `sendRename` and `fetchPatientPage` stand for your own types and transport functions.

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

Options (`opts`):

| Option | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | `false` observes nothing, creates no entry and reads `idle`. |
| `suspense` | `false` | See below. |

- Variables are compared by value (`stableKey`), so an inline `{ school }` never resubscribes.
- `refetch()` marks the entry stale and fetches it. It never rejects: the error is in the state.

## Suspense

With `suspense: true`, the component suspends while there is no data, and `data` is no longer optional in its type. A failure with no data is thrown to the nearest error boundary. With `enabled: false` it never suspends: the query reads `idle`.

What a Suspense render fetched is not fetched again when the component mounts, whatever the query's `staleTime`. After an entity is evicted, a suspending component suspends again while the query refetches.

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

`ErrorBoundary` here is the one of [react-error-boundary](https://www.npmjs.com/package/react-error-boundary); any error boundary works. To retry after an error, start the fetch again before resetting the boundary (`onReset={() => patients.prefetch(client, { school })}`, see [troubleshooting](./docs/troubleshooting.md)).

## Mutations

`useMutation(def)` holds its status per hook instance. `run` resolves with the server data and rejects with the error (also in `error`); the mutation finishes even if the component unmounts, it only stops reporting. When runs overlap, the latest owns the state.

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

`@softistx/riva-react/infinite` binds a list built with `infinite()` from `@softistx/riva/infinite` (see the core README). `connection` reads the Relay shape `{ edges: [{ node, cursor }], pageInfo }` out of a page, and `data.nodes` is every loaded page's nodes, flattened.

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

It also returns `fetchPrevious`, `hasPrevious`, `isFetchingPrevious` and `refetch` (every loaded page). Its option `enabled` defaults to `true`.

## Stores

`@softistx/riva-react/store` binds a store built with `store()` from `@softistx/riva/store` (see the core README). `useStore(def)` returns `[s, a]`: `s` is the state and the computeds, `a` the actions bound to the provider's client (stable for that client).

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

- `s` is tracked per key: the component re-renders only when a key it read during its render changes. `s.total` alone does not re-render on a `filter` change.
- `s` is read-only: a write throws a `RivaError` with code `RIVA_STORE` (`Store "books": "filter" is read-only here; write it in an action.`). Write through `a`.
- `s` is a new object after each change of a key the component read, so `useMemo(…, [s])` and `React.memo` children that take `s` follow it.
- `useValue(BookStore.total)` still reads a single value.
- Under `renderToString` the hook reads the provider's client, as `useValue` does.

## Entities

`@softistx/riva-react/entities` reads one entity of the normalized cache (`@softistx/riva/entities`) by its ref (`Type:id`). The component re-renders when that entity's fields change, and only then. `useFragment<T>(ref)` takes the entity's type as its parameter (default `Record<string, unknown>`), and accepts `null` or `undefined` as a ref: it then reads `undefined`, as it does for a missing entity.

```tsx
import { useFragment } from '@softistx/riva-react/entities';

function PatientName({ id }: { id: string }) {
	const patient = useFragment<{ name: string }>(`Patient:${id}`);
	return <span>{patient?.name ?? '…'}</span>;
}
```

## Server rendering

Render each request under its own `RivaProvider` with its own client; no hook holds module-level state, so nothing leaks between requests.

```tsx
import { createRivaClient } from '@softistx/riva';
import { RivaProvider } from '@softistx/riva-react';
import { renderToReadableStream } from 'react-dom/server';

export async function handle(school: string): Promise<Response> {
	const client = createRivaClient(); // one per request
	await patients.ensure(client, { school }); // so the first render has data
	const stream = await renderToReadableStream(
		<RivaProvider client={client}>
			<PatientList school={school} />
		</RivaProvider>,
	);
	return new Response(stream, { headers: { 'content-type': 'text/html' } });
}
```

- A hook never starts a fetch during a server render, except through `suspense: true`, which waits for it and streams the result (`renderToReadableStream` and `renderToPipeableStream`).
- Effects and subscriptions run in the browser only.
- Handing the server's cache to the browser (dehydrate and hydrate) comes with `@softistx/riva-react-router`; until then the browser fetches what it does not have.

## Entry points

| Import | Adds |
| --- | --- |
| `@softistx/riva-react` | `RivaProvider`, `useClient`, `useSignal`, `useValue`, `useQuery`, `useMutation` |
| `@softistx/riva-react/infinite` | `useInfiniteQuery` |
| `@softistx/riva-react/entities` | `useFragment` |
| `@softistx/riva-react/store` | `useStore` |

Core plus the main entry stays under 9 kB gzipped; the subpaths cost nothing until imported.
