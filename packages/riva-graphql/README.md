# @softistx/riva-graphql

GraphQL for [riva](https://github.com/softistx/riva/blob/develop/packages/riva/README.md) over [`@softistx/graphql-client`](https://github.com/softistx/graphql): `query`, `mutation` and `infinite` definitions typed from a `TypedDocumentNode` (variables and data are inferred, never annotated), a per-client transport, errors mapped to riva's, and a codegen plugin that emits the allowlist a BFF's `/_data` route executes.

Errors and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md). The normalized GraphQL cache is a later slice: today a definition keeps its data as is.

```sh
bun add @softistx/riva @softistx/riva-graphql @softistx/graphql-client graphql
```

Peers: `@softistx/riva` and `@softistx/graphql-client`. `graphql`, `@graphql-codegen/plugin-helpers` and `@graphql-typed-document-node/core` are optional: the plugin needs the first two, and the types of every definition need the third (`@softistx/graphql-client` already brings it). The runtime entries import none of them.

GraphQL documents are written as constants in `SCREAMING_SNAKE_CASE` (`PATIENTS_QUERY`); the client preset's codegen derives the types. Use `documentMode: 'documentNode'` (the preset's default): a definition reads the document's operation, so a `TypedDocumentString` is refused.

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
import { PATIENTS_QUERY } from './patients.graphql';

export const patients = query(PATIENTS_QUERY, { staleTime: '30s' });

await patients.ensure(client, { school: 'north' }); // variables typed from the document
const state = client.get(patients, { school: 'north' }); // state.data is the document's data
patients.invalidate(client, { school: 'north' });
```

A document with no variables takes none: `viewer.ensure(client)`. The options are the core's (`staleTime`, `gcTime`, `retry`, `refetchEvery`, …) minus `fetch`. The definition's `id` is the document's persisted id, else its operation name; pass `id` to define one document twice with different options.

A document that is not exactly one named query or mutation is refused when the definition is created, with a `TypeError` that says why: no operation, several operations, no name, a subscription, or the wrong helper (`query()` on a mutation).

## Mutations

```ts
import { mutation } from '@softistx/riva-graphql';
import { RENAME_PATIENT_MUTATION } from './patients.graphql';

export const renamePatient = mutation(RENAME_PATIENT_MUTATION, {
	invalidates: [patients], // observed lists refetch once it succeeded
});

await renamePatient.run(client, { id: '1', name: 'Ana' }); // rejects after the rollback
```

The options are the core's (`optimistic`, `updates`, `invalidates`, `retry`), typed from the document: `optimistic` and `updates` receive the document's variables and data.

## Infinite lists

```ts
import { infinite } from '@softistx/riva-graphql/infinite';
import { PATIENTS_QUERY } from './patients.graphql';

export const patientsFeed = infinite(PATIENTS_QUERY, {
	connection: (data) => data.patients, // { edges, pageInfo }
});

await patientsFeed.ensure(client, { school: 'north' });
await patientsFeed.fetchNext(client, { school: 'north' });
const { data, hasNext } = client.get(patientsFeed, { school: 'north' });
data?.nodes; // the flattened nodes, typed from the document
```

The document declares the cursor variables (`$after`, `$before`); pass `cursor: { after: 'cursor' }` when they are named otherwise. The caller's variables leave the cursors out. The list's id is the query's id plus `#infinite`, so `query(PATIENTS_QUERY)` and `infinite(PATIENTS_QUERY, …)` never share a cache entry.

## Errors

The transport maps `@softistx/graphql-client`'s errors to riva's, so `instanceof` holds and the core's retry policy applies (never retried: a refusal, 4xx; retried: 5xx, 408, 429, the network):

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

## Allowlist codegen plugin

`@softistx/riva-graphql/codegen` is a `@graphql-codegen` plugin, for Node only. It writes the manifest a BFF's `/_data` route reads: one entry per query and mutation, `{ id, name, kind, document }`, keyed by id and sorted, so the same documents give the same bytes.

```ts
// codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

export default {
	schema: 'schema.graphql',
	documents: ['app/**/*.graphql'],
	generates: {
		'app/generated/allowlist.json': {
			plugins: ['@softistx/riva-graphql/codegen'],
			config: { ids: 'hash' }, // or 'name'
		},
	},
} satisfies CodegenConfig;
```

- `document` is the operation's text followed by the fragments it uses (sorted by name).
- With `ids: 'hash'` (default) the id is the SHA-256 of that text in hex, computed by `persistedIdOf`, the function the runtime exports. With `ids: 'name'` the id is the operation name, for documents with no persisted id.
- Two operations with one name fail the run, naming both files. So does an unnamed operation, or a fragment no document defines. Subscriptions are skipped.

## Entry points

| Import | Holds | Notes |
|---|---|---|
| `@softistx/riva-graphql` | `query`, `mutation`, `provideGraphQL`, `graphqlClientTransport`, `toRivaError`, `operationOf`, `persistedIdOf` | Imports no peer at runtime. |
| `@softistx/riva-graphql/infinite` | `infinite` | Imports `@softistx/riva/infinite`. |
| `@softistx/riva-graphql/codegen` | `plugin`, `buildAllowlist` | Node and codegen only; needs `graphql` and `@graphql-codegen/plugin-helpers`. |

The core plus the main entry stays under 8 kB gzipped, `@softistx/graphql-client` and `graphql` not counted.
