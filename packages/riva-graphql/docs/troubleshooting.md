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
provideGraphQL(client, graphqlClientTransport(createGraphQLClient({ url: 'https://api.example.com/graphql' })));
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

## `ENOENT` or a `SyntaxError` from `writeAllowlist` reading `persisted-documents.json`

**When:** `writeAllowlist` (or the `afterAllFileWrite` hook running it) fails with a missing file, or invalid JSON.

**Why:** the client preset writes `persisted-documents.json` only with `persistedDocuments: true`, and `writeAllowlist` reads it. The hook runs after all files are written, so a failed or partial codegen run, a wrong path or a preset without the option leaves nothing valid to read.

**Fix:** set `presetConfig: { persistedDocuments: true }` on the preset, check that the path passed to `writeAllowlist` is the preset's output folder plus `persisted-documents.json`, and fix the codegen error that came first.

## Two definitions share one cache entry

**Why:** a definition's `id` is the document's persisted id, else its operation name; two definitions with the same `id` collide.

**Fix:** pass a distinct `id` when you define one document twice with different options.

## An error has the API's code but `error.fields` is undefined

**Why:** `RivaRequestError` carries `code`, `status` and `retryable`; the refused fields, params and every GraphQL error stay on its `cause`, the `ApiError` of `@softistx/graphql-client`.

**Fix:** read `error.cause` (see "Errors" in the [README](../README.md#errors)).

## A query is retried although the API refused it

**Why:** a refusal carries `extensions.http.status` below 500, or none (read as 400): it is never retried. A 5xx, 408 or 429 is, like any other transport failure.

**Fix:** have the API send a 4xx `extensions.http.status` for a refusal, or decide yourself: `retry: (failures, error) => …`.

## `The GraphQL cache holds JSON: field X holds Y.`

Code: `RIVA_CACHE` (`RivaError`).

**Why:** `normalized()` stores plain JSON; a `Date`, a class instance, a function or a non-finite number in a result (a custom scalar parsed by the client) cannot be stored.

**Fix:** keep the scalar serialized in the result, or parse it at the point of use.

## `The GraphQL cache stores an operation's data: an object.`

Code: `RIVA_CACHE` (`RivaError`).

**Why:** the transport returned something other than an object for the operation's data.

**Fix:** check the transport; a GraphQL result's `data` is an object.

## `The document has no fragment X` and `The document holds no operation`

Both are `TypeError`s, thrown when `query()` or `mutation()` is called.

**Why:** the document given to `query()` or `mutation()` with a `normalized()` cache spreads a fragment it does not define, or defines no operation.

**Fix:** pass the preset's document, which carries the fragments it uses.

## `riva-graphql: the field "X" selects no __typename, which the cache needs to identify objects: …`

A `TypeError`, thrown when `query()` or `mutation()` is called with a `normalized()` cache.

**Why:** an object with no `__typename` has no identity, so it could not be stored as an entity. The cache refuses the document rather than rewrite it: a persisted id is the hash of the document's text.

**Fix:** add the client preset's `addTypenameSelectionDocumentTransform` to its `documentTransforms` (or select `__typename` yourself in every selection set below the root).

```ts
// codegen.ts
import { addTypenameSelectionDocumentTransform } from '@graphql-codegen/client-preset';

presetConfig: { persistedDocuments: true, documentTransforms: [addTypenameSelectionDocumentTransform] }
```

## `The cache cannot read the query's data after a fetch.`

Code: `RIVA_CACHE` (`RivaError`), shown as the query's error status; `ensure` rejects with it.

**When:** a query with a `normalized()` cache fetched, and the result still reads as a miss.

**Why:** the server's answer lacks a selected field (or an object the selection needs), so the whole result reads `undefined`: the cache never serves half a result. A second fetch would give the same answer, so it stops instead of looping. A query already showing data whose entity is later evicted is refetched on its own.

**Fix:** have the API return every selected field (`null` for an empty one), or remove it from the selection. The generic explanation is on the [core page](../../riva/docs/troubleshooting.md).

## `This client already uses other entity identity rules…`

Code: `RIVA_CACHE` (`RivaError`).

**Why:** two `normalized()` (or `entities()`) policies with different `keys` or `identify` were used on one client.

**Fix:** create one `normalized(options)` and pass it to every definition. The core explains it in [its troubleshooting page](../../riva/docs/troubleshooting.md#this-client-already-uses-other-entity-identity-rules).

## A query fetches although another query showed the same entity

**Why:** each query entry has its own root: which fields it selected and with which arguments. A query's first fetch is unconditional, and it reads from the store afterwards. Later, a field or entity its selection needs that no write has stored (an argument set not yet fetched: `friends({"first":2})` is not `friends({"first":1})`) makes its data `undefined`, and an observed query refetches once.

**Fix:** expected: the query fetches, then reads from the store.
