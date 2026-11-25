# @softistx/riva-graphql

GraphQL for [riva](https://github.com/softistx/riva/blob/develop/packages/riva/README.md) over [`@softistx/graphql-client`](https://github.com/softistx/graphql): `query`, `mutation` and `infinite` definitions typed from a `TypedDocumentNode` (variables and data are inferred, never annotated), a per-riva transport, errors mapped to riva's, and a codegen helper that builds the allowlist a BFF's `/_data` route executes from the client preset's persisted documents.

Guides and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).

```sh
bun add @softistx/riva @softistx/riva-graphql @softistx/graphql-client @graphql-typed-document-node/core graphql
```

Peers: `@softistx/riva` and `@softistx/graphql-client`. `graphql` and `@graphql-typed-document-node/core` are optional: `graphql` is needed by `/server` (the allowlist parses the manifest's text) and `/codegen`, and the types of every definition need the second (`@softistx/graphql-client` already brings it). The main, `/infinite`, `/cache` and `/bff` entries import none of them.

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
import { createRiva } from '@softistx/riva';
import { graphql } from '@softistx/riva-graphql';
import { normalized } from '@softistx/riva-graphql/cache';
import { ADD_BOOK, BOOK_ADDED, BOOKS_QUERY } from './graphql';

const gql = createGraphQLClient({ url: 'https://api.example.com/graphql' });
// graphql(transport) works too; the optional second argument stores the data, e.g. { cache: normalized() }
const riva = createRiva({ graphql: graphql(gql, { cache: normalized() }) });

const data = await riva.graphql.query(BOOKS_QUERY, { first: 10 }, { staleTime: '30s' });
const book = await riva.graphql.mutate(ADD_BOOK, { title: 'Dune' }, { invalidates: [BOOKS_QUERY] });
const stop = riva.graphql.subscribe(BOOK_ADDED, {}, {
	next(added) {}, // after the result was merged into the entity cache
	error(e) {}, // a failure ends the subscription
});
stop();
```

- Data and variables are typed from the document; the variables are optional when it has none.
- `query` options: `staleTime` (this call only, over the definition's and the riva's `defaults`) and `signal`. `mutate` options: `invalidates` (documents, definitions or `at(query, vars)`, marked stale once it succeeded) and `signal`.
- The definitions behind the calls are made once per riva, per document (never shared between rivas), so `riva.graphql.query(DOC)` and `query(DOC)` defined by hand share an id: use one of them per document on a riva (a second raises `Two definitions share the id`), or pass `id` to the hand-made one.
- `subscribe` needs a transport that can: the `@softistx/graphql-client` one does (server-sent events, never reconnected). With `normalized()` each result is merged into the entity cache; with another cache, or none, it only goes to `next`.
- Definitions (`query()`, `mutation()`, `infinite()`) keep working on the same riva, for shared settings.

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
| `@softistx/riva-graphql` | `query`, `mutation`, `provideGraphQL`, `graphqlClientTransport`, `toRivaError`, `operationOf` | Imports `@softistx/riva` only; no optional peer. |
| `@softistx/riva-graphql/infinite` | `infinite` | Imports `@softistx/riva/infinite`. |
| `@softistx/riva-graphql/cache` | `normalized` | Imports `@softistx/riva/entities`; no `graphql` value import. |
| `@softistx/riva-graphql/bff` | `bffTransport` | Browser; imports `@softistx/riva/ssr` only. |
| `@softistx/riva-graphql/server` | `allowlist` | Server only; needs `graphql`. |
| `@softistx/riva-graphql/codegen` | `buildAllowlist`, `writeAllowlist` | Node and codegen only; needs `graphql`. |

Exported types: `GraphQLTransport`, `Operation`, `OperationKind`, `VarsOf` and `GraphQLQueryOptions`, `GraphQLMutationOptions`, `OperationCache` (main entry); `NormalizedOptions`, `PossibleTypes` (`/cache`); `GraphQLInfiniteOptions` (`/infinite`); `AllowlistConfig`, `AllowlistEntry`, `AllowlistManifest` (`/codegen`); `BffTransportOptions` (`/bff`); `AllowlistInput`, `DataOperation`, `DataSource` (`/server`).

riva + riva-graphql stays under 8 kB gzipped, and with the entities and the cache under 11 kB (checked by the repo's size budget), `@softistx/graphql-client` and `graphql` not counted.
