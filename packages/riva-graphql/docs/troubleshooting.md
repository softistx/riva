# Troubleshooting

Each entry is headed by the message you will see.

## `No GraphQL transport on this RivaClient: call provideGraphQL(client, graphqlClientTransport(gqlClient)) when you create it.`

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** a query, mutation or infinite list ran on a `RivaClient` that was never given a transport.

**Why:** definitions are stateless and the transport lives on the client, so two server requests never share one.

**Fix:** provide it where the client is created, per request on the server.

```ts
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRivaClient } from '@softistx/riva';
import { graphqlClientTransport, provideGraphQL } from '@softistx/riva-graphql';

const client = createRivaClient();
provideGraphQL(client, graphqlClientTransport(createGraphQLClient({ url })));
```

## `riva-graphql: the operation has no name; name it (query Patients { ... }) so it has an id.`

A `TypeError`, thrown when the definition is created.

**Why:** the definition's id, its cache keys and the allowlist's ids come from the operation name (or its persisted id), so an anonymous operation has none.

**Fix:** name the operation: `query Patients { ... }`, not `{ ... }`.

## `riva-graphql: the document holds N operations; define one operation per document.`

**Why:** one definition is one operation. Fragments may share the document; a second operation may not.

**Fix:** split the document, one constant per operation (`PATIENTS_QUERY`, `PATIENT_QUERY`).

## `riva-graphql: the document holds no operation (a fragment alone cannot be queried).`

**Fix:** pass the query or mutation document, not the fragment's.

## `riva-graphql: X is a mutation; use mutation() to define it, not query().`

**Fix:** use the helper that matches the document: `query()` and `infinite()` for queries, `mutation()` for mutations. Subscriptions are not supported yet (`riva-graphql: X is a subscription; …`).

## `riva-graphql: expected a TypedDocumentNode (set documentMode: "documentNode" in the client preset), got something else.`

**When:** the document is a string or a `TypedDocumentString`.

**Why:** a definition reads the operation's name and kind from the parsed document, without importing `graphql` at runtime.

**Fix:** generate documents as `TypedDocumentNode` (the client preset's default `documentMode`).

```ts
// codegen.ts
generates: { 'app/generated/': { preset: 'client', presetConfig: { persistedDocuments: true } } }
```

## `@softistx/riva-graphql/codegen: the operation "X" is defined twice (sha256:a… and sha256:b…); operation names must be unique.`

**Why:** operation names are the ids of `ids: 'name'` (and the runtime's, without persisted ids), so they are unique.

**Fix:** rename one of them.

Related: `the persisted document <hash> must hold exactly one operation.` and `… must be a named query or mutation.` come from a text with no operation, several, an anonymous one or a subscription. Fix the document that produced it.

## A query is refused by the BFF with an unknown id

**When:** the `/_data` route does not know the id a definition sends.

**Why:** the runtime id is the document's `__meta__.hash` (the client preset's `persistedDocuments`), else its operation name. The manifest keeps the keys of the preset's `persisted-documents.json` as they are, so they match, unless the manifest is stale (codegen ran without the `afterAllFileWrite` step), or documents carry no hash while the manifest is keyed by hash.

**Fix:** run `writeAllowlist` from `hooks.afterAllFileWrite` (see "Allowlist codegen" in the [README](../README.md#allowlist-codegen)) so it follows each codegen run. With no `persistedDocuments`, use `ids: 'name'`.

## Two definitions share one cache entry

**Why:** a definition's `id` is the document's persisted id, else its operation name; two definitions with the same `id` collide.

**Fix:** pass a distinct `id` when you define one document twice with different options.

## An error has the API's code but `error.fields` is undefined

**Why:** `RivaRequestError` carries `code`, `status` and `retryable`; the refused fields, params and every GraphQL error stay on its `cause`, the `ApiError` of `@softistx/graphql-client`.

**Fix:** read `error.cause` (see "Errors" in the [README](../README.md#errors)).

## A query is retried although the API refused it

**Why:** a refusal carries `extensions.http.status` below 500, or none (read as 400): it is never retried. A 5xx, 408 or 429 is, like any other transport failure.

**Fix:** have the API send a 4xx `extensions.http.status` for a refusal, or decide yourself: `retry: (failures, error) => …`.
