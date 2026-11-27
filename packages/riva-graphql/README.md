# @softistx/riva-graphql

GraphQL for [riva](https://github.com/softistx/riva/blob/develop/packages/riva/README.md) over [`@softistx/graphql-client`](https://github.com/softistx/graphql): `createRiva({ graphql: withGraphQL(client) })` gives `riva.graphql.query`, `mutation` and `subscribe`, typed from a `TypedDocumentNode` (variables and data are inferred, never annotated) and returning reactive, awaitable resources, with React hooks over them, errors mapped to riva's, and a codegen helper that builds the allowlist a BFF's `/_data` route executes. `query()`, `mutation()` and `infinite()` definitions stay for settings several call sites share.

Guides and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).

```sh
bun add @softistx/riva @softistx/riva-graphql @softistx/graphql-client @graphql-typed-document-node/core graphql
bun add react @softistx/riva-react # only for the hooks
```

Peers: `@softistx/riva` and `@softistx/graphql-client`. `graphql` and `@graphql-typed-document-node/core` are optional: `graphql` is needed by `/server` (the allowlist parses the manifest's text) and `/codegen`, and the types of every definition need the second (`@softistx/graphql-client` already brings it). The main, `/infinite`, `/cache` and `/bff` entries import none of them. `react` and `@softistx/riva-react` are optional too: only `/react` needs them.

## Documents

Documents are written with the client preset's `graphql()` function, as `SCREAMING_SNAKE_CASE` constants (`PATIENTS_QUERY`). Use `documentMode: 'documentNode'` (the preset's default). Name each constant after its kind: `_QUERY`, `_MUTATION`, `_SUBSCRIPTION`. Every example below uses these constants. [Guide](./docs/guide/documents.md).

```ts
// app/patients/graphql.ts
import { graphql } from '../generated/gql';

export const PATIENTS_QUERY = graphql(`
	query Patients($school: ID!, $first: Int, $after: String) {
		patients(school: $school, first: $first, after: $after) {
			__typename
			edges { __typename node { __typename id name } cursor }
			pageInfo { __typename hasNextPage endCursor }
		}
	}
`);
```

## Simple API

Install the extension once, then call GraphQL like a function: no definition, no key, no glue. Calls return the data and throw `RivaError`s; calls with the same document and variables share one cache entry and one in-flight request.

```ts
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva, signal } from '@softistx/riva';
import { withGraphQL } from '@softistx/riva-graphql';
import { normalized } from '@softistx/riva-graphql/cache';
import { ADD_BOOK_MUTATION, BOOK_ADDED_SUBSCRIPTION, BOOKS_QUERY } from './graphql';

const gql = createGraphQLClient({ url: 'https://api.example.com/graphql' });
// withGraphQL(transport) works too; the optional second argument stores the data, e.g. { cache: normalized() }
const riva = createRiva({
	graphql: withGraphQL(gql, { cache: normalized() }),
	defaults: { staleTime: '30s' }, // for every query that sets none
});

const data = await riva.graphql.query(BOOKS_QUERY, { first: 10 }, { staleTime: '30s' }); // one-shot: data or throws

// The same call is a reactive resource: state, subscribe, tracked variables.
const first = signal(10);
const signedIn = signal(true);
const books = riva.graphql.query(BOOKS_QUERY, () => ({ first: riva.get(first) }), {
	enabled: () => riva.get(signedIn), // false: status 'idle', nothing fetched
	keepPrevious: true, // new variables: the old data stays, `placeholder: true`
});
books.state; // { status: 'idle' | 'loading' | 'success' | 'error', data, error, isFetching, placeholder }
const off = books.subscribe((state) => console.log(state.status)); // the first reader starts the fetch

const save = riva.graphql.mutation(ADD_BOOK_MUTATION); // a handle: state (idle first), reset()
const book = await save({ title: 'Dune' }, { invalidates: [BOOKS_QUERY] });
await riva.graphql.mutate(ADD_BOOK_MUTATION, { title: 'Dune' }); // one-shot, no handle

const added = riva.graphql.subscribe(BOOK_ADDED_SUBSCRIPTION, {}, {
	next(added) {}, // after the result was merged into the entity cache
	error(e) {}, // a stream failure ends the subscription
	complete() {}, // the stream ended on its own
});
const closeFeed = added.subscribe((state) => console.log(state.status)); // opens the stream; the last unsubscribe closes it
```

- Data and variables are typed from the document; the variables are optional when it has none.
- Variables are a plain value, a riva signal or computed, or a function that reads signals (tracked: when what it reads changes, the key is derived again). Equal variables, however they were derived, are one key; a subscription does not reconnect for them.
- `query` returns a `Resource` (`@softistx/riva/resource`): `state`, `subscribe` and awaitable. Options: `staleTime` (this call only), `enabled` (a boolean or tracked function; while false the variables function is not called), `keepPrevious` (default true) and `signal` (stops the wait of `await`). It is lazy: it fetches from its first subscriber or observed reader, never on a server, where `await` is the way to load.
- A query selecting `@defer` or `@stream` renders progressively: `data` is there from the first part (`status: 'success'`, `isFetching: true` while parts are coming), each part updates it. `useQuery` from `@softistx/riva-react` also exposes `dataState` (`'streaming'`, then `'complete'`). No `for await` in the component: `useGraphQL(PROFILE_QUERY)` is enough. [Guide](./docs/guide/incremental.md).
- A response with data **and** errors is the `error` state: `data` keeps the partial result and `error` is a `RivaGraphQLError` listing every error with its path. `await` rejects with it.
- `mutate` and the `mutation` handle take `invalidates` (documents, definitions or `at(query, vars)`, marked stale once it succeeded) and `signal`. `mutation` makes a new handle at each call; its state follows the last call.
- `subscribe` returns a stream resource (no `await`): `loading` until the first result, then `success` with the last one. Callbacks and `enabled` are optional. It needs a transport that can (a transport must not define `mutate`, which is how `withGraphQL()` tells a client from a transport): the `@softistx/graphql-client` one does (server-sent events, never reconnected). An error thrown by `next` (or by the cache merge) is raised outside the stream and ends it, never sent to `error`. With `normalized()` each result is merged into the entity cache; with another cache, or none, it only goes to `next`.
- The definitions behind the calls are made once per riva, per document (never shared between rivas), under the id `graphql:<operation id>`: a hand-made `query(DOC)` on the same riva keeps its own entries (and cache). To share them, pass the definition itself: `riva.graphql.query(def, vars)` and `useGraphQL(def, vars)` use it as is (its own id), so a loader's `def.ensure(riva, vars)` and the component read one entry. `invalidates: [DOC]` marks the simple call's entries stale; `invalidates: [def]` marks the definition's entries, which a definition-based call reads. `invalidates` is an array (no function form), checked before the mutation runs.
- `withGraphQL(client, { cache: normalized() })` (from `/cache`) stores every call's data as entities, so queries that show one object stay in step. Selections must include `__typename`; a miss is a miss (the data is `undefined` and an observed query refetches). [Guide](./docs/guide/cache.md).
- Definitions (`query()`, `mutation()`, `infinite()`) keep working on the same riva, for shared settings: [Shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md). The transport is installed by `withGraphQL(...)`; [guide](./docs/guide/transport.md), [simple API guide](./docs/guide/simple-api.md).

## React hooks

`@softistx/riva-graphql/react` calls the simple API from components, on the riva of the nearest `RivaProvider` (`react` and `@softistx/riva-react` are optional peers; the riva needs `createRiva({ graphql: withGraphQL(client) })`).

```tsx
import { useGraphQL, useGraphQLMutation, useGraphQLSubscription } from '@softistx/riva-graphql/react';

// BOOKS_QUERY, ADD_BOOK_MUTATION and BOOK_ADDED_SUBSCRIPTION are documents written with graphql(), as above.
// Spinner and Failure are schematic: your own components.
function Books({ first }: { first: number }) {
	const books = useGraphQL(BOOKS_QUERY, { first });
	const { mutate: add } = useGraphQLMutation(ADD_BOOK_MUTATION);
	if (books.status === 'loading') return <Spinner />;
	if (books.status === 'error') return <Failure error={books.error} />; // books.data keeps a partial result
	return <button onClick={() => add({ title: 'Dune' }, { invalidates: [BOOKS_QUERY] })}>{books.data.books.length}</button>;
}
// useGraphQL(def, vars) takes a query(DOC) definition: it shares its entry with a loader's def.ensure(riva, vars).
// useGraphQL(DOC, vars, { suspense: true }) suspends and returns the success state.
// The query hooks take a document or a definition; a mutation definition goes through useMutation(def) from @softistx/riva-react.
// useGraphQLSubscription(BOOK_ADDED_SUBSCRIPTION, {}, { next(added) {} }) is loading, then the last message.
```

How the hooks behave:

- They return the resource state (`idle | loading | success | error`). A server render seeds and dehydrates like `useQuery`, and hydration does not refetch fresh data.
- Variables are a plain value, a riva signal or computed, or a function. A function is evaluated at each render, so it follows props (`() => ({ id: props.id })`) as well as the signals it reads; a change of the result re-derives the key. Equal variables are one key. A signal or computed is keyed by identity: define it once (module level or `useMemo`), never inline in render.
- A new key refetches and keeps the previous data as `placeholder` (`keepPrevious`, default true).
- While `enabled` is false the status is `idle`, the variables function is not called and nothing is fetched.
- `suspense: true` suspends until data and types the state as `success`. Any error, a response with partial data and errors included, goes to the nearest error boundary, and resetting the boundary refetches it by itself. `enabled` cannot be combined with `suspense` (a type error): a suspending hook has data or throws, it is never idle. A subscription cannot suspend.
- Under `suspense` the fetch uses a `staleTime` of at least 1000 ms (your `staleTime`, else the riva's default, whichever is longer), so the data a Suspense render just fetched is not fetched again at mount.

The mutation hook returns `{ mutate, status, data, error, reset }`, the same shape as `useMutation` and `useRestMutation` (type `MutationResult`). `mutate` and `reset` keep their identity across renders; to react to a result, read `status` and `data`:

```tsx
const { mutate, status } = useGraphQLMutation(ADD_BOOK_MUTATION);
<button onClick={() => mutate({ title: 'Dune' })}>Add</button>;
useEffect(() => {
	if (status === 'success') close();
}, [status]);
```

## Errors

The transport maps `@softistx/graphql-client`'s errors to riva's, so `instanceof` holds and the core's retry policy applies (never retried: a refusal, 4xx; retried: 5xx, 408, 429, the network). An `ApiError` that carries no status is read as 400, so it is not retried:

| graphql-client | riva | `code` | retried |
|---|---|---|---|
| `ApiError` (the response had `errors`) | `RivaRequestError` | the API's `extensions.code`, untouched (`GRAPHQL_ERROR` when it sent none) | 5xx, 408, 429 |
| `ApiStatusError` | `RivaHttpError` | `HTTP_<status>` | 5xx, 408, 429 |
| `ApiUnavailableError` (unreachable, timeout) | `RivaNetworkError` | `RIVA_NETWORK` | yes |
| `ApiUnavailableError` (no data, no errors) | `RivaRequestError` | `RIVA_INVALID_RESPONSE` | no |
| the call's abort | `RivaAbortError` | `RIVA_ABORT` | never |

The original error is the `cause`. A result missing a selected field, or a non-JSON value, throws `RIVA_CACHE`. [Guide](./docs/guide/errors.md).

## Allowlist codegen

A BFF's `/_data` route executes only documents it knows by id. The client preset (`@graphql-codegen/client-preset`, run by `@graphql-codegen/cli`) with `persistedDocuments: true` writes `persisted-documents.json`, `{ [hash]: text }`, and puts the same hash on each document as `__meta__.hash`, the id a definition sends. `@softistx/riva-graphql/codegen` turns that file into the manifest: one entry per query and mutation, `{ id, name, kind, document }`, keyed by the preset's hash **as it is** (never recomputed, so an id matches by construction) and sorted, so the same documents give the same bytes.

Wire it from codegen's `afterAllFileWrite` hook with `writeAllowlist(persisted, out)`; `buildAllowlist(persisted, config?)` is the same step without the files. [Guide](./docs/guide/codegen.md).

```ts
import { writeAllowlist } from '@softistx/riva-graphql/codegen';

await writeAllowlist('app/generated/persisted-documents.json', 'app/generated/allowlist.json');
```

## BFF mode

In the browser, `bffTransport` posts `{ id, variables }` to your `dataRoute` (from `@softistx/riva-react-router/server`) and reads `{ data }` back, Dates included. The browser never sends a document: the route runs the manifest's text through the request riva, with the session your `setup` gave it.

```ts
// browser: app/riva.ts
import { createRiva } from '@softistx/riva';
import { withGraphQL } from '@softistx/riva-graphql';
import { bffTransport } from '@softistx/riva-graphql/bff';

export const createBrowserRiva = () =>
	createRiva({ graphql: withGraphQL(bffTransport({ url: '/_data' })), defaults: { staleTime: '30s' } });
```

```ts
// server: app/routes/_data.ts (a route with an action and a loader)
import { dataRoute } from '@softistx/riva-react-router/server';
import { allowlist } from '@softistx/riva-graphql/server';
import manifest from '../generated/allowlist.json';

const route = dataRoute({
	sources: [allowlist(manifest)],
});
export const action = route.action;
export const loader = route.loader;
```

`bffTransport({ url?, fetch?, headers? })` defaults to `/_data`. Keep `/bff` and `/server` out of each other's bundle. [Guide](./docs/guide/bff.md).

## Shared definitions

A definition is a query, a mutation or an infinite list written once at module level, for what the simple API cannot say: polling, optimistic updates, a cursor-paginated list, one `staleTime` shared by several readers. They run on the same riva as the simple calls, under their own cache entries.

```ts
import { mutation, query } from '@softistx/riva-graphql';
import { infinite } from '@softistx/riva-graphql/infinite';
import { PATIENTS_QUERY, RENAME_PATIENT_MUTATION } from './graphql';

export const patients = query(PATIENTS_QUERY, { staleTime: '30s' });
export const renamePatient = mutation(RENAME_PATIENT_MUTATION, {
	optimistic: (v) => ({ renamePatient: { __typename: 'Patient', id: v.id, name: v.name } }),
	invalidates: [patients], // observed lists refetch once it succeeded
});
export const patientsFeed = infinite(PATIENTS_QUERY, { connection: (data) => data.patients });

await patients.ensure(riva, { school: 'north' }); // variables typed from the document
await renamePatient.mutate(riva, { id: '1', name: 'Ana' }); // rejects after the rollback
await patientsFeed.fetchNext(riva, { school: 'north' });
```

When to prefer one, and how both live on one riva: [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md). Every option: [queries](./docs/guide/queries.md), [mutations](./docs/guide/mutations.md), [infinite lists](./docs/guide/infinite.md) and the [normalized cache](./docs/guide/cache.md). **Definition ids must be unique.**

## Entry points

| Import | Holds | Notes |
|---|---|---|
| `@softistx/riva-graphql` | `withGraphQL` (the extension), `RivaGraphQLError`, `query`, `mutation`, `provideGraphQL`, `graphqlClientTransport`, `toRivaError`, `operationOf` | Imports `@softistx/riva` only; no optional peer. |
| `@softistx/riva-graphql/infinite` | `infinite` | Imports `@softistx/riva/infinite`. |
| `@softistx/riva-graphql/cache` | `normalized` | Imports `@softistx/riva/entities`; no `graphql` value import. |
| `@softistx/riva-graphql/bff` | `bffTransport` | Browser; imports `@softistx/riva/ssr` only. |
| `@softistx/riva-graphql/react` | `useGraphQL`, `useGraphQLMutation`, `useGraphQLSubscription` (types `UseGraphQLOptions`, `MutationResult` re-exported from `@softistx/riva-react/resource`) | Optional peers `react` and `@softistx/riva-react`. |
| `@softistx/riva-graphql/server` | `allowlist` | Server only; needs `graphql`. |
| `@softistx/riva-graphql/codegen` | `buildAllowlist`, `writeAllowlist` | Node and codegen only; needs `graphql`. |

Exported types: `TrackedInput` (the core type of a call input, re-exported), `GraphQLApi`, `GraphQLQueryCall`, `GraphQLMutateCall`, `GraphQLSubscribeCall`, `GraphQLSimpleOptions`, `GraphQLTransport`, `Operation`, `OperationKind`, `VarsOf` and `GraphQLQueryOptions`, `GraphQLMutationOptions`, `OperationCache` (main entry); `NormalizedOptions`, `PossibleTypes` (`/cache`); `GraphQLInfiniteOptions` (`/infinite`); `AllowlistConfig`, `AllowlistEntry`, `AllowlistManifest` (`/codegen`); `BffTransportOptions` (`/bff`); `AllowlistInput`, `DataOperation`, `DataSource` (`/server`).

riva + riva-graphql stays within 9728 B gzipped, with the cache within 14336 B, and riva + `/bff` within 11296 B (checked by the repo's size budget), `@softistx/graphql-client` and `graphql` not counted.

## Documentation

- [Guides](https://github.com/softistx/riva/blob/develop/packages/riva-graphql/docs/README.md): the simple API, documents, transport, BFF and allowlist.
- [Troubleshooting](https://github.com/softistx/riva/blob/develop/packages/riva-graphql/docs/troubleshooting.md): every error and its fix.
- [Roadmap](https://github.com/softistx/riva/blob/develop/docs/roadmap.md) and [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).
