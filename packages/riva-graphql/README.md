# @softistx/riva-graphql

GraphQL for [riva](https://github.com/softistx/riva/blob/develop/packages/riva/README.md) over [`@softistx/graphql-client`](https://github.com/softistx/graphql): `query`, `mutation` and `infinite` definitions typed from a `TypedDocumentNode` (variables and data are inferred, never annotated), a per-client transport, errors mapped to riva's, and a codegen helper that builds the allowlist a BFF's `/_data` route executes from the client preset's persisted documents.

Errors and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).

```sh
bun add @softistx/riva @softistx/riva-graphql @softistx/graphql-client graphql
```

Peers: `@softistx/riva` and `@softistx/graphql-client`. `graphql` and `@graphql-typed-document-node/core` are optional: the codegen helper needs the first, and the types of every definition need the second (`@softistx/graphql-client` already brings it). The runtime entries import none of them.

## Documents

Documents are written in your code with the client preset's `graphql()` function, as constants in `SCREAMING_SNAKE_CASE` (`PATIENTS_QUERY`); codegen derives the types and, with `persistedDocuments`, a hash per operation. Use `documentMode: 'documentNode'` (the preset's default): a definition reads the document's operation, so a `TypedDocumentString` is refused.

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

export const PATIENT_QUERY = graphql(`
	query Patient($id: ID!) {
		patient(id: $id) { __typename id name }
	}
`);

export const RENAME_PATIENT_MUTATION = graphql(`
	mutation RenamePatient($id: ID!, $name: String!) {
		renamePatient(id: $id, name: $name) { __typename id name }
	}
`);
```

The examples below use these constants (each selects `__typename`, as the normalized cache needs; the client preset's `addTypenameSelectionDocumentTransform` adds it for you), an `url` such as `https://api.example.com/graphql`, and a `client` made as shown next.

## Provide the transport

Definitions are stateless; the transport lives on the `RivaClient` that runs them. Give each client one, when you create it.

```ts
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRivaClient } from '@softistx/riva';
import { graphqlClientTransport, provideGraphQL } from '@softistx/riva-graphql';

const gql = createGraphQLClient({ url: 'https://api.example.com/graphql' });

export const client = createRivaClient();
provideGraphQL(client, graphqlClientTransport(gql));
```

On the server, build both inside the request handler, so the caller's credentials stay with the request. A definition that runs on a client with no transport throws a `RivaScopeError` naming `provideGraphQL`.

`graphqlClientTransport` sends a query through `gql.query` and a mutation through `gql.mutate`, with the definition's `AbortSignal`. The client's own `persisted` option decides whether the text or the persisted id is sent:

```ts
const gql = createGraphQLClient({
	url: 'https://api.example.com/graphql',
	persisted: { mode: 'documentId' }, // the preset's persistedDocuments hash
});
```

Any object with `execute(operation, variables, { signal })` is a transport. The operation carries `document`, `name`, `kind`, `persistedId` and `id` (the persisted id, else the name), so a transport that only posts an id and variables to a BFF route fits.

## Queries

```ts
import { query } from '@softistx/riva-graphql';
import { PATIENTS_QUERY } from './graphql';

export const patients = query(PATIENTS_QUERY, { staleTime: '30s' });

await patients.ensure(client, { school: 'north' }); // variables typed from the document
const state = client.get(patients, { school: 'north' }); // state.data is the document's data
patients.invalidate(client, { school: 'north' });
```

A document with no variables takes none: `viewer.ensure(client)` (`viewer` being a definition of `query(VIEWER_QUERY)`, an illustrative `query Viewer { viewer { id } }`). The options are the core's (`staleTime`, `gcTime`, `retry`, `refetchEvery`, …) minus `fetch`. The definition's `id` is the document's persisted id, else its operation name; pass `id` to define one document twice with different options. **Ids must be unique**: two definitions with the same `id` (an override reused by mistake, or two documents sharing an operation name) collide on one cache entry.

A document that is not exactly one named query or mutation is refused when the definition is created, with a `TypeError` that says why: no operation, several operations, no name, a subscription, or the wrong helper (`query()` on a mutation).

## Mutations

```ts
import { mutation } from '@softistx/riva-graphql';
import { RENAME_PATIENT_MUTATION } from './graphql';

export const renamePatient = mutation(RENAME_PATIENT_MUTATION, {
	invalidates: [patients], // observed lists refetch once it succeeded
});

await renamePatient.run(client, { id: '1', name: 'Ana' }); // rejects after the rollback
```

The options are the core's (`optimistic`, `updates`, `invalidates`, `retry`), typed from the document: `optimistic` and `updates` receive the document's variables and data.

## Infinite lists

```ts
import { infinite } from '@softistx/riva-graphql/infinite';
import { PATIENTS_QUERY } from './graphql';

export const patientsFeed = infinite(PATIENTS_QUERY, {
	connection: (data) => data.patients, // { edges, pageInfo }
});

await patientsFeed.ensure(client, { school: 'north' });
await patientsFeed.fetchNext(client, { school: 'north' });
const { data, hasNext } = client.get(patientsFeed, { school: 'north' });
data?.nodes; // the flattened nodes, typed from the document
```

The document declares the cursor variables (`$after`, `$before`); name them with `cursor` when they are called otherwise:

```ts
// PATIENTS_BY_CURSOR_QUERY is illustrative: a Patients document declaring `$afterCursor`
export const feed = infinite(PATIENTS_BY_CURSOR_QUERY, {
	connection: (data) => data.patients,
	cursor: { after: 'afterCursor' }, // query Patients($afterCursor: String) { … }
});
```

The caller's variables leave the cursors out. The list's id is the query's id plus `#infinite`, so `query(PATIENTS_QUERY)` and `infinite(PATIENTS_QUERY, …)` never share a cache entry.

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

`query()` and `mutation()` take `cache?: CachePolicy | OperationCache`: a core policy as is, or an `OperationCache`, an object with `forOperation(op)` that returns the policy for the operation (`op.document`, `name`, `kind`, `id`). `normalized()` is one; a cache of your own implements `forOperation` the same way. `infinite()` and the core `query()` take core policies only.

`normalized()` walks the operation's selection set and stores each object that has a `__typename` and an `id` once, as an entity, so two queries that show the same patient update each other, and a mutation's result updates every query showing it. It is built on the core entity store (`@softistx/riva/entities`): `readEntity`, `writeEntity`, `useFragment` and a mutation's optimistic layer, commit and rollback work as with `entities()`.

- **Objects without an id** are stored inside their parent, merged with what another query stored for the same field. When a shared scalar disagrees (a reordered list) the stored object is replaced, so another query selecting more fields of it refetches once.
- **Aliases** are stored under the field's name and read back under the response key; one field selected under two aliases has its sub-selections merged.
- **Field arguments** get one stored field per argument set, variables resolved. They are not shown by `readEntity` or a plain `entities()` read, which skip those keys; read them through the query.
- **Fragments** (inline and named) and type conditions work. `possibleTypes` maps each interface or union to the names of its member types (`{ Person: ['Patient', 'Doctor'] }`, as codegen's `fragment-matcher` writes it), and may nest abstract types. Without it, a fragment on an abstract type is applied only to the objects whose `__typename` equals its condition; for an object with no `__typename` the cache cannot tell and reads the fragment's fields too, so a miss stays visible.
- **Identity** options are the core's (`keys`, `identify`). Share one `normalized()` between a client's definitions: a second one with other identity rules is refused by the core ([the core page](../riva/docs/troubleshooting.md#this-client-already-uses-other-entity-identity-rules)).
- **Selections must include `__typename`** below the operation's root, selected directly (or in an inline fragment with no type condition: one branch of a union or a named fragment covers only its own type), which the client preset's `addTypenameSelectionDocumentTransform` adds. A document that does not is refused when `query()` or `mutation()` is called, with a `TypeError`; the document is never rewritten, since a persisted id is the hash of its text.
- **A miss is a miss**: if a selected field or entity is missing from the store, the query's data is `undefined`, never half-served. An observed query then refetches; if a fetch's result is itself missing a selected field, the query ends in the error status with code `RIVA_CACHE` (`ensure` rejects with it) instead of looping.
- The cache holds JSON: a `Date`, a function or a `NaN` in a result throws a `RivaError` with code `RIVA_CACHE`.

## Errors

The transport maps `@softistx/graphql-client`'s errors to riva's, so `instanceof` holds and the core's retry policy applies (never retried: a refusal, 4xx; retried: 5xx, 408, 429, the network). An `ApiError` that carries no status is read as 400, so it is not retried:

| graphql-client | riva | `code` | retried |
|---|---|---|---|
| `ApiError` (the response had `errors`) | `RivaRequestError` | the API's `extensions.code`, untouched (`GRAPHQL_ERROR` when it sent none) | 5xx, 408, 429 |
| `ApiStatusError` | `RivaHttpError` | `HTTP_<status>` | 5xx, 408, 429 |
| `ApiUnavailableError` (unreachable, timeout) | `RivaNetworkError` | `RIVA_NETWORK` | yes |
| `ApiUnavailableError` (no data, no errors) | `RivaRequestError` | `RIVA_INVALID_RESPONSE` | no |
| the call's abort | `RivaAbortError` | `RIVA_ABORT` | never |

The original error is the `cause`, with its `fields`, `params` and `errors`:

```ts
import { RivaRequestError } from '@softistx/riva';
import { isApiError } from '@softistx/graphql-client';

const state = client.get(patients, { school: 'north' });
if (state.error instanceof RivaRequestError) {
	state.error.code; // 'patient.errors.not-found', as the API sent it
	if (isApiError(state.error.cause)) state.error.cause.fields; // the refused fields
}
```

`toRivaError(error, signal?)` is exported for a transport of your own.

## Allowlist codegen

A BFF's `/_data` route executes only documents it knows by id. The client preset (`@graphql-codegen/client-preset`, run by `@graphql-codegen/cli`) with `persistedDocuments: true` writes `persisted-documents.json`, `{ [hash]: text }`, and puts the same hash on each document as `__meta__.hash`, the id a definition sends. `@softistx/riva-graphql/codegen` turns that file into the manifest: one entry per query and mutation, `{ id, name, kind, document }`, keyed by the preset's hash **as it is** (never recomputed, so an id matches by construction) and sorted, so the same documents give the same bytes.

```ts
// codegen.ts (needs @graphql-codegen/cli and @graphql-codegen/client-preset)
import type { CodegenConfig } from '@graphql-codegen/cli';
import { addTypenameSelectionDocumentTransform } from '@graphql-codegen/client-preset';

export default {
	schema: 'schema.graphql',
	documents: ['app/**/*.{ts,tsx}'],
	generates: {
		'app/generated/': {
			preset: 'client',
			presetConfig: { persistedDocuments: true },
			// Needed by `normalized()`: it adds __typename to every selection set.
			documentTransforms: [addTypenameSelectionDocumentTransform],
		},
	},
	// Runs once every file is written, whatever the order of the outputs.
	hooks: { afterAllFileWrite: ['bun scripts/allowlist.ts'] },
} satisfies CodegenConfig;
```

```ts
// scripts/allowlist.ts
import { writeAllowlist } from '@softistx/riva-graphql/codegen';

await writeAllowlist(
	'app/generated/persisted-documents.json',
	'app/generated/allowlist.json',
);
```

`buildAllowlist(persisted, config?)` is the same step without the files: it takes the parsed `persisted-documents.json` and returns the manifest.

```ts
import { buildAllowlist } from '@softistx/riva-graphql/codegen';

const manifest = buildAllowlist({
	'sha256:ab12…': 'fragment F on Patient { id } query Patients { patients { ...F } }',
});
// { 'sha256:ab12…': { id: 'sha256:ab12…', name: 'Patients', kind: 'query', document: '…' } }
```

- `document` is the preset's text for the operation: the operation and the fragments it uses.
- `ids: 'persisted'` (default) keys by the preset's hash. `ids: 'name'` keys by operation name, for documents with no persisted id (the runtime then uses the name as the id).
- It fails on a text with no operation or several, an anonymous one, a subscription, and two operations of one name.
- Do not rely on the order of outputs inside one codegen run: the manifest is built after all of them, from the hook.

## BFF mode

In the browser, `bffTransport` posts `{ id, variables }` to your `dataRoute` (from `@softistx/riva-react-router/server`) and reads `{ data }` back, Dates included. The browser never sends a document: the route runs the manifest's text through the request client, with the session your `setup` gave it.

```ts
// browser: app/riva.client.ts
import { bffTransport } from '@softistx/riva-graphql/bff';
import { provideGraphQL } from '@softistx/riva-graphql';

provideGraphQL(client, bffTransport({ url: '/_data' }));
```

```ts
// server: app/routes/_data.ts (a route with an action and a loader)
import { dataRoute } from '@softistx/riva-react-router/server';
import { allowlist } from '@softistx/riva-graphql/server';
import manifest from '../generated/allowlist.json';

const route = dataRoute({ sources: [allowlist(manifest)] });
export const action = route.action;
export const loader = route.loader;
```

- `bffTransport({ url?, fetch?, headers? })`: `url` defaults to `/_data`; `headers` adds per-call headers (a CSRF token, say). The route's refusals and the API's errors come back as `RivaRequestError` with the route's `code` and `status` (retryable for 5xx, 408 and 429); a failed fetch is a `RivaNetworkError`, an abort a `RivaAbortError`.
- `allowlist(manifest)` is a `DataSource`: it knows only the manifest's ids, parses each document once, and runs it through the transport `provideGraphQL` set on the request client.
- Keep `/bff` and `/server` out of each other's bundle: `/bff` is for the browser, `/server` imports `graphql`.

## Entry points

| Import | Holds | Notes |
|---|---|---|
| `@softistx/riva-graphql` | `query`, `mutation`, `provideGraphQL`, `graphqlClientTransport`, `toRivaError`, `operationOf`, `VERSION` | Imports `@softistx/riva` only; no optional peer. |
| `@softistx/riva-graphql/infinite` | `infinite` | Imports `@softistx/riva/infinite`. |
| `@softistx/riva-graphql/cache` | `normalized` | Imports `@softistx/riva/entities`; no `graphql` value import. |
| `@softistx/riva-graphql/bff` | `bffTransport` | Browser; imports `@softistx/riva/ssr` only. |
| `@softistx/riva-graphql/server` | `allowlist` | Server only; needs `graphql`. |
| `@softistx/riva-graphql/codegen` | `buildAllowlist`, `writeAllowlist` | Node and codegen only; needs `graphql`. |

Exported types: `GraphQLTransport`, `Operation`, `OperationKind`, `VarsOf` and `GraphQLQueryOptions`, `GraphQLMutationOptions`, `OperationCache` (main entry); `NormalizedOptions`, `PossibleTypes` (`/cache`); `GraphQLInfiniteOptions` (`/infinite`); `AllowlistConfig`, `AllowlistEntry`, `AllowlistManifest` (`/codegen`); `BffTransportOptions` (`/bff`); `DataOperation`, `DataSource` (`/server`).

riva + riva-graphql stays under 8 kB gzipped, and with the entities and the cache under 11 kB (checked by the repo's size budget), `@softistx/graphql-client` and `graphql` not counted.
