# @softistx/riva-graphql

GraphQL for [riva](https://github.com/softistx/riva/blob/develop/packages/riva/README.md) over [`@softistx/graphql-client`](https://github.com/softistx/graphql): `query`, `mutation` and `infinite` definitions typed from a `TypedDocumentNode` (variables and data are inferred, never annotated), a per-riva transport, errors mapped to riva's, and a codegen helper that builds the allowlist a BFF's `/_data` route executes from the client preset's persisted documents.

Guides and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).

```sh
bun add @softistx/riva @softistx/riva-graphql @softistx/graphql-client @graphql-typed-document-node/core graphql
bun add react @softistx/riva-react # only for the hooks
```

Peers: `@softistx/riva` and `@softistx/graphql-client`. `graphql` and `@graphql-typed-document-node/core` are optional: `graphql` is needed by `/server` (the allowlist parses the manifest's text) and `/codegen`, and the types of every definition need the second (`@softistx/graphql-client` already brings it). The main, `/infinite`, `/cache` and `/bff` entries import none of them. `react` and `@softistx/riva-react` are optional too: only `/react` needs them.

## Documents

Documents are written with the client preset's `graphql()` function, as `SCREAMING_SNAKE_CASE` constants (`PATIENTS_QUERY`). Use `documentMode: 'documentNode'` (the preset's default). Every example below uses these constants. [Guide](./docs/guide/documents.md).

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
import { graphql } from '@softistx/riva-graphql';
import { normalized } from '@softistx/riva-graphql/cache';
import { ADD_BOOK, BOOK_ADDED, BOOKS_QUERY } from './graphql';

const gql = createGraphQLClient({ url: 'https://api.example.com/graphql' });
// graphql(transport) works too; the optional second argument stores the data, e.g. { cache: normalized() }
const riva = createRiva({ graphql: graphql(gql, { cache: normalized() }) });

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

const save = riva.graphql.mutation(ADD_BOOK); // a handle: state (idle first), reset()
const book = await save({ title: 'Dune' }, { invalidates: [BOOKS_QUERY] });
await riva.graphql.mutate(ADD_BOOK, { title: 'Dune' }); // one-shot, no handle

const added = riva.graphql.subscribe(BOOK_ADDED, {}, {
	next(added) {}, // after the result was merged into the entity cache
	error(e) {}, // a stream failure ends the subscription
	complete() {}, // the stream ended on its own
});
const closeFeed = added.subscribe((state) => console.log(state.status)); // opens the stream; the last unsubscribe closes it
```

- Data and variables are typed from the document; the variables are optional when it has none.
- Variables are a plain value, a riva signal or computed, or a function that reads signals (tracked: when what it reads changes, the key is derived again). Equal variables, however they were derived, are one key; a subscription does not reconnect for them.
- `query` returns a `Resource` (`@softistx/riva/resource`): `state`, `subscribe` and awaitable. Options: `staleTime` (this call only), `enabled` (a boolean or tracked function; while false the variables function is not called), `keepPrevious` (default true) and `signal` (stops the wait of `await`). It is lazy: it fetches from its first subscriber or observed reader, never on a server, where `await` is the way to load.
- A response with data **and** errors is the `error` state: `data` keeps the partial result and `error` is a `GraphQLError` listing every error with its path. `await` rejects with it.
- `mutate` and the `mutation` handle take `invalidates` (documents, definitions or `at(query, vars)`, marked stale once it succeeded) and `signal`. `mutation` makes a new handle at each call; its state follows the last call.
- `subscribe` returns a stream resource (no `await`): `loading` until the first result, then `success` with the last one. Callbacks and `enabled` are optional. It needs a transport that can (a transport must not define `mutate`, which is how `graphql()` tells a client from a transport): the `@softistx/graphql-client` one does (server-sent events, never reconnected). An error thrown by `next` (or by the cache merge) is raised outside the stream and ends it, never sent to `error`. With `normalized()` each result is merged into the entity cache; with another cache, or none, it only goes to `next`.
- The definitions behind the calls are made once per riva, per document (never shared between rivas), under the id `graphql:<operation id>`: a hand-made `query(DOC)` on the same riva keeps its own entries (and cache). `invalidates: [DOC]` marks the simple call's entries stale; `invalidates: [handMadeDef]` marks the hand-made definition's only. `invalidates` is an array (no function form), checked before the mutation runs.
- Definitions (`query()`, `mutation()`, `infinite()`) keep working on the same riva, for shared settings.

## React hooks

`@softistx/riva-graphql/react` calls the simple API from components, on the riva of the nearest `RivaProvider` (`react` and `@softistx/riva-react` are optional peers; the riva needs `createRiva({ graphql })`).

```tsx
import { useGraphQL, useGraphQLMutation, useGraphQLSubscription } from '@softistx/riva-graphql/react';

// BOOKS_QUERY, ADD_BOOK_MUTATION and BOOK_ADDED_SUBSCRIPTION are documents written with graphql(), as above.
function Books({ first }: { first: number }) {
	const books = useGraphQL(BOOKS_QUERY, { first });
	const add = useGraphQLMutation(ADD_BOOK_MUTATION);
	if (books.status === 'loading') return <Spinner />;
	if (books.status === 'error') return <Failure error={books.error} />; // books.data keeps a partial result
	return <button onClick={() => add({ title: 'Dune' }, { invalidates: [BOOKS_QUERY] })}>{books.data.books.length}</button>;
}
// useGraphQL(DOC, vars, { suspense: true }) suspends and returns the success state.
// useGraphQLSubscription(BOOK_ADDED_SUBSCRIPTION, {}, { next(added) {} }) is loading, then the last message.
```

How the hooks behave:

- They return the resource state (`idle | loading | success | error`). A server render seeds and dehydrates like `useQuery`, and hydration does not refetch fresh data.
- Variables are a plain value, a riva signal or computed, or a function. A function is evaluated at each render, so it follows props (`() => ({ id: props.id })`) as well as the signals it reads; a change of the result re-derives the key. Equal variables are one key.
- A new key refetches and keeps the previous data as `placeholder` (`keepPrevious`, default true).
- While `enabled` is false the status is `idle`, the variables function is not called and nothing is fetched.
- `suspense: true` suspends until data and types the state as `success`. Any error, a response with partial data and errors included, goes to the nearest error boundary. A disabled hook does not suspend. A subscription cannot suspend.
- Under `suspense` the fetch uses a `staleTime` of at least 1000 ms (your `staleTime`, else the riva's default, whichever is longer), so the data a Suspense render just fetched is not fetched again at mount.

The mutation hooks return a callable with the state fields and `reset`. The callable (and `reset`) change identity with the state, so call them from handlers and never list them in an effect's dependencies; to react to a result, read `status` and `data`:

```tsx
const add = useGraphQLMutation(ADD_BOOK_MUTATION);
// Handler: fine.
<button onClick={() => add({ title: 'Dune' })}>Add</button>;
// Effect: depend on the state, not on `add`.
useEffect(() => {
	if (add.status === 'success') close();
}, [add.status]);
```

## Provide the transport

Definitions are stateless; the transport lives on the `Riva` that runs them. Give each riva one, when you create it.

```ts
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva } from '@softistx/riva';
import { graphqlClientTransport, provideGraphQL } from '@softistx/riva-graphql';

const gql = createGraphQLClient({ url: 'https://api.example.com/graphql' });

export const riva = createRiva();
provideGraphQL(riva, graphqlClientTransport(gql));
```

On the server, build both inside the request handler. A definition that runs on a riva with no transport throws a `RivaScopeError` naming `provideGraphQL`. Any object with `execute(operation, variables, { signal })` is a transport. [Guide](./docs/guide/transport.md).

## Queries

```ts
import { query } from '@softistx/riva-graphql';
import { PATIENTS_QUERY } from './graphql';

export const patients = query(PATIENTS_QUERY, { staleTime: '30s' });

await patients.ensure(riva, { school: 'north' }); // variables typed from the document
const state = riva.get(patients, { school: 'north' }); // state.data is the document's data
patients.invalidate(riva, { school: 'north' });
```

Options: the core's (`staleTime`, `gcTime`, `retry`, `refetchEvery`, …) plus `id` and `cache`. **Ids must be unique.** [Guide](./docs/guide/queries.md).

## Mutations

```ts
import { mutation } from '@softistx/riva-graphql';
import { RENAME_PATIENT_MUTATION } from './graphql';

export const renamePatient = mutation(RENAME_PATIENT_MUTATION, {
	invalidates: [patients], // observed lists refetch once it succeeded
});

await renamePatient.run(riva, { id: '1', name: 'Ana' }); // rejects after the rollback
```

Options: `optimistic`, `updates`, `invalidates`, `retry`, `cache`, typed from the document. [Guide](./docs/guide/mutations.md).

## Infinite lists

```ts
import { infinite } from '@softistx/riva-graphql/infinite';
import { PATIENTS_QUERY } from './graphql';

export const patientsFeed = infinite(PATIENTS_QUERY, {
	connection: (data) => data.patients, // { edges, pageInfo }
});

await patientsFeed.ensure(riva, { school: 'north' });
await patientsFeed.fetchNext(riva, { school: 'north' });
const { data, hasNext } = riva.get(patientsFeed, { school: 'north' });
data?.nodes; // the flattened nodes, typed from the document
```

Name the cursor variables with `cursor: { after: 'afterCursor' }` when the document calls them otherwise. [Guide](./docs/guide/infinite.md).

## Normalized cache

```ts
import { mutation, query } from '@softistx/riva-graphql';
import { normalized } from '@softistx/riva-graphql/cache';
import { PATIENT_QUERY, PATIENTS_QUERY, RENAME_PATIENT_MUTATION } from './graphql';

// PATIENT_QUERY: query Patient($id: ID!) { patient(id: $id) { __typename id name } }
const cache = normalized({ possibleTypes: { Person: ['Patient', 'Doctor'] } });

export const patient = query(PATIENT_QUERY, { cache });
export const patients = query(PATIENTS_QUERY, { cache });
export const rename = mutation(RENAME_PATIENT_MUTATION, {
	cache, // the mutation's result updates every entity it returns
	optimistic: (v) => ({ renamePatient: { __typename: 'Patient', id: v.id, name: v.name } }),
});
```

Selections must include `__typename`; a miss is a miss (the data is `undefined` and an observed query refetches). [Guide](./docs/guide/cache.md).

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
// browser: app/riva.riva.ts
import { bffTransport } from '@softistx/riva-graphql/bff';
import { provideGraphQL } from '@softistx/riva-graphql';

provideGraphQL(riva, bffTransport({ url: '/_data' }));
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

## Entry points

| Import | Holds | Notes |
|---|---|---|
| `@softistx/riva-graphql` | `graphql`, `query`, `mutation`, `provideGraphQL`, `graphqlClientTransport`, `toRivaError`, `operationOf` | Imports `@softistx/riva` only; no optional peer. |
| `@softistx/riva-graphql/infinite` | `infinite` | Imports `@softistx/riva/infinite`. |
| `@softistx/riva-graphql/cache` | `normalized` | Imports `@softistx/riva/entities`; no `graphql` value import. |
| `@softistx/riva-graphql/bff` | `bffTransport` | Browser; imports `@softistx/riva/ssr` only. |
| `@softistx/riva-graphql/react` | `useGraphQL`, `useGraphQLMutation`, `useGraphQLSubscription` | Optional peers `react` and `@softistx/riva-react`. |
| `@softistx/riva-graphql/server` | `allowlist` | Server only; needs `graphql`. |
| `@softistx/riva-graphql/codegen` | `buildAllowlist`, `writeAllowlist` | Node and codegen only; needs `graphql`. |

Exported types: `GraphQLApi`, `QueryCall`, `MutateCall`, `SubscribeCall`, `GraphQLSimpleOptions`, `GraphQLTransport`, `Operation`, `OperationKind`, `VarsOf` and `GraphQLQueryOptions`, `GraphQLMutationOptions`, `OperationCache` (main entry); `NormalizedOptions`, `PossibleTypes` (`/cache`); `GraphQLInfiniteOptions` (`/infinite`); `AllowlistConfig`, `AllowlistEntry`, `AllowlistManifest` (`/codegen`); `BffTransportOptions` (`/bff`); `AllowlistInput`, `DataOperation`, `DataSource` (`/server`).

riva + riva-graphql stays under 8 kB gzipped, and with the entities and the cache under 12 kB (12288 B; `/bff` 9728 B) (checked by the repo's size budget), `@softistx/graphql-client` and `graphql` not counted.
