# @softistx/riva-react

React bindings for [riva](https://github.com/softistx/riva/blob/develop/packages/riva/README.md): a provider, the building blocks of the adapters' hooks (`useGraphQL`, `useRest`), hooks over signals, and hooks over shared query and mutation definitions, with Suspense. Typed end to end: variables and data are inferred, never annotated at the call site.

Guides and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).

```sh
bun add @softistx/riva @softistx/riva-react react
```

Peers: `react` ^19 and `@softistx/riva`. Every hook binds through `useSyncExternalStore`, so it is concurrent-safe and renders on the server.

The examples are schematic: `Patient`, `fetchPatients`, `sendRename` and `fetchPatientPage` stand for your own types and transport functions; `Spinner` and `Failure` for your own components.

## Provider

One `Riva` per tree: one in the browser, one per request on the server. A hook with no provider above it throws a `RivaScopeError` that names the fix.

```tsx
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva } from '@softistx/riva';
import { withGraphQL } from '@softistx/riva-graphql';
import { RivaProvider } from '@softistx/riva-react';

const riva = createRiva({
	graphql: withGraphQL(createGraphQLClient({ url: 'https://api.example.com/graphql' })), // per request on the server
	defaults: { staleTime: '30s' },
});

export const App = () => (
	<RivaProvider riva={riva}>
		<Patients />
	</RivaProvider>
);
```

`useRiva()` returns the riva, to call it from an event handler: `riva.graphql.mutate(...)`, or `def.invalidate(riva, vars)` on a definition. [Guide](./docs/guide/provider.md).

## Hooks of the adapters

`@softistx/riva-graphql/react` and `@softistx/riva-rest/react` ship the hooks for GraphQL and REST: they call `riva.graphql` and `riva.rest` on the riva of the provider and return the resource state (`idle | loading | success | error`). This package supplies what they are made of (below).

```tsx
import { useGraphQL, useGraphQLMutation } from '@softistx/riva-graphql/react';
import { BOOKS_QUERY, ADD_BOOK_MUTATION } from './graphql'; // typed documents

function Books({ first }: { first: number }) {
	const books = useGraphQL(BOOKS_QUERY, { first }); // typed from the document
	const { mutate: add } = useGraphQLMutation(ADD_BOOK_MUTATION);
	if (books.status === 'loading') return <Spinner />;
	if (books.status === 'error') return <Failure error={books.error} />;
	return <button onClick={() => add({ title: 'Dune' }, { invalidates: [BOOKS_QUERY] })}>{books.data.books.length}</button>;
}
```

The REST equivalents are `useRest(path, input)` and `useRestMutation(method, path)`. Their guides: [GraphQL README](https://github.com/softistx/riva/blob/develop/packages/riva-graphql/README.md#react-hooks), [REST README](https://github.com/softistx/riva/blob/develop/packages/riva-rest/README.md#react-hooks).

## Resource hooks

`@softistx/riva-react/resource` holds the generic blocks the adapters' hooks (`useGraphQL`, `useRest`, ...) are built on; use them to make a hook for your own resource.

```ts
import { useCallResource, useMutationHandle, useResource, useStableInput } from '@softistx/riva-react/resource';

// BOOKS_QUERY and ADD_BOOK_MUTATION are documents written with graphql(); the names are schematic.
function Books({ first }: { first: number }) {
	// useStableInput(id, input, enabled) gives the key and what to hand the call.
	const input = useStableInput('books', () => ({ first }), undefined);
	// `StableInput.input` is `unknown`: a generic hook casts it once, to the variables type.
	// The key identifies the resource: derive it from everything `make` reads.
	const state = useResource(input.key, (riva) =>
		riva.graphql.query(BOOKS_QUERY, input.input as { first: number }, { enabled: input.enabled }),
	);
	// useMutationHandle(key, make): { mutate, status, data, error, reset }, mutate and reset stable.
	const { mutate: save } = useMutationHandle('add-book', (riva) => riva.graphql.mutation(ADD_BOOK_MUTATION));
	return null;
}
```

`useResource(key, make, { suspense?, keepPrevious? })` makes one resource per riva and key, as a discriminated state; `suspense: true` suspends and types it as success, and `suspenseStaleTime(riva, staleTime?, def?)` is the `staleTime` such a fetch should use (the call's, else the definition's `def`, else the riva's default, at least 1000 ms; an invalid duration string throws `RIVA_DURATION`). `useStableInput` returns `{ key, input, enabled }`; a function input is evaluated at each render (untracked) to derive the key, so it follows props, and the resource still tracks the signals it reads. A disabled hook never calls it. `useMutationHandle` returns the same `{ mutate, status, data, error, reset }` as every mutation hook; `mutate` and `reset` keep their identity across renders, so they are safe in effect dependencies. For adapter authors: `useCallResource(id, input, options, make)` is what `useGraphQL` and `useRest` share (stable key, `enabled`, `keepPrevious`, Suspense `staleTime`). [Guide](./docs/guide/resource.md).

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

## Hooks over shared definitions

`useQuery`, `useMutation` and `useInfiniteQuery` read a definition (`query()`, `mutation()`, `infinite()`): settings written once and shared by several call sites, such as polling or an optimistic update. For a plain read or write, use the adapters' hooks above; [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md) says when a definition earns its place.

```tsx
import { mutation, query } from '@softistx/riva';
import { useMutation, useQuery } from '@softistx/riva-react';

const patients = query({
	id: 'patients',
	staleTime: '30s',
	fetch: ({ school }: { school: string }, { signal }) => fetchPatients(school, signal), // Promise<Patient[]>
});
const rename = mutation({
	id: 'renamePatient',
	mutate: (vars: { id: string; name: string }, { signal }) => sendRename(vars, signal), // Promise<Patient>
	invalidates: [patients],
});

function PatientList({ school }: { school: string }) {
	const { data, status, error, refetch } = useQuery(patients, { school });
	const { mutate, status: saving } = useMutation(rename); // `mutate` rejects with the error, also in `error`
	if (status === 'error') return <button onClick={refetch}>Retry: {String(error)}</button>;
	return (
		<ul>
			{data?.map((p) => (
				<li key={p.id}>
					{p.name} <button disabled={saving === 'loading'} onClick={() => mutate({ id: p.id, name: 'New name' }).catch(() => {})}>Rename</button>
				</li>
			))}
		</ul>
	);
}
```

`useQuery(def, vars?, opts?)` returns `status`, `data`, `error`, `isFetching`, `updatedAt`, `dataState` (only for a query delivering its data in parts, such as a GraphQL `@defer`: `'streaming'` while parts arrive, with `data` readable from the first, then `'complete'`) and `refetch`; its options are `enabled` (`true`) and `suspense` (`false`). Variables are compared by value, so an inline `{ school }` never resubscribes; `refetch()` never rejects. With `suspense: true` the component suspends while there is no data (until the first part for a query delivering its data in parts), `data` is no longer optional, and a failure goes to the nearest error boundary; resetting the boundary refetches it by itself. Guides: [queries](./docs/guide/queries.md), [suspense](./docs/guide/suspense.md), [mutations](./docs/guide/mutations.md).

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
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva } from '@softistx/riva';
import { withGraphQL } from '@softistx/riva-graphql';
import { useGraphQL } from '@softistx/riva-graphql/react';
import { RivaProvider } from '@softistx/riva-react';
import { renderToReadableStream } from 'react-dom/server';
import { PATIENTS_QUERY } from './graphql'; // a typed document

function PatientList({ school }: { school: string }) {
	const patients = useGraphQL(PATIENTS_QUERY, { school });
	return <p>{patients.status === 'success' ? patients.data.patients.edges.length : '…'}</p>;
}

export async function handle(school: string): Promise<Response> {
	const riva = createRiva({
		graphql: withGraphQL(createGraphQLClient({ url: 'https://api.example.com/graphql' })),
		defaults: { staleTime: '30s' },
	}); // one per request
	await riva.graphql.query(PATIENTS_QUERY, { school }); // so the first render has data
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
| `@softistx/riva-react/resource` | `useResource`, `useCallResource`, `useMutationHandle`, `useStableInput`, `suspenseStaleTime` (the blocks the adapters' hooks are built on) |

Types: `MutationResult` (what every mutation hook returns), `RivaProviderProps`, `SuspendedState` and `UseQueryOptions` (main entry), `InfiniteResult` and `UseInfiniteQueryOptions` (`/infinite`), `UseResourceOptions`, `CallResourceOptions`, `ResourceCall`, `StableInput` and `SuspendedState` (`/resource`; `MutationResult` is exported there too).

Core plus the main entry stays under 9 kB gzipped; the subpaths cost nothing until imported.

## Documentation

- [Guides](https://github.com/softistx/riva/blob/develop/packages/riva-react/docs/README.md): provider, resource hooks, signals, stores, server rendering.
- [Troubleshooting](https://github.com/softistx/riva/blob/develop/packages/riva-react/docs/troubleshooting.md): every error and its fix.
- [Roadmap](https://github.com/softistx/riva/blob/develop/docs/roadmap.md) and [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).
