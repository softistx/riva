# Troubleshooting

Each entry is headed by the message you will see.

## `No GraphQL transport on this Riva: call provideGraphQL(riva, graphqlClientTransport(gqlClient)) when you create it.`

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** a definition (`query()`, `mutation()`, `infinite()`) ran on a `Riva` that was never given a transport. A riva made with `createRiva({ graphql: withGraphQL(client) })` has one already.

**Why:** the transport lives on the riva, not on the definition, so two server requests never share one.

**Fix:** create the riva with the extension, per request on the server.

```ts
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva } from '@softistx/riva';
import { withGraphQL } from '@softistx/riva-graphql';

const riva = createRiva({ graphql: withGraphQL(createGraphQLClient({ url: 'https://api.example.com/graphql' })) });
```

A riva made with `createRiva()` takes its transport with `provideGraphQL(riva, graphqlClientTransport(client))`, but has no `riva.graphql`.

## `riva-graphql: the operation has no name; name it (query Patients { ... }) so it has an id.`

Code: `RIVA_DEFINITION` (`RivaError`), thrown when the definition is created.

**Why:** the definition's id, its cache keys and the allowlist's ids come from the operation name (or its persisted id), so an anonymous operation has none.

**Fix:** name the operation: `query Patients { ... }`, not `{ ... }`.

## `riva-graphql: the document holds N operations; define one operation per document.`

**Why:** one definition is one operation. Fragments may share the document; a second operation may not.

**Fix:** split the document, one constant per operation (`PATIENTS_QUERY`, `PATIENT_QUERY`).

## `riva-graphql: the document holds no operation (a fragment alone cannot be queried).`

**Fix:** pass the query or mutation document, not the fragment's.

## `riva-graphql: X is a mutation; use mutation() to define it, not query().`

**Fix:** use the helper that matches the document: `query()` and `infinite()` for queries, `mutation()` for mutations.

## `riva-graphql: expected a TypedDocumentNode (set documentMode: "documentNode" in the client preset), got something else.`

**When:** the document is a string or a `TypedDocumentString`.

**Why:** a definition reads the operation's name and kind from the parsed document, without importing `graphql` at runtime.

**Fix:** generate documents as `TypedDocumentNode` (the client preset's default `documentMode`).

```ts
// codegen.ts
generates: { 'app/generated/': { preset: 'riva', presetConfig: { persistedDocuments: true } } }
```

## `@softistx/riva-graphql/codegen: the operation "X" is defined twice (sha256:a… and sha256:b…); operation names must be unique.`

**Why:** operation names are the ids of `ids: 'name'` (and the runtime's, without persisted ids), so they are unique.

**Fix:** rename one of them.

Related: `the persisted document <hash> must hold exactly one operation.` and `… must be a named query or mutation.` come from a text with no operation, several, an anonymous one or a subscription. Fix the document that produced it.

## A query is refused by the BFF with an unknown id

**When:** the `/_data` route does not know the id a definition sends.

**Why:** the runtime id is the document's `__meta__.hash` (the client preset's `persistedDocuments`), else its operation name. The manifest keeps the keys of the preset's `persisted-documents.json` as they are, so they match, unless the manifest is stale (codegen ran without the `afterAllFileWrite` step), or documents carry no hash while the manifest is keyed by hash.

**Fix:** run `writeAllowlist` from `hooks.afterAllFileWrite` (see "Allowlist codegen" in the [README](../README.md#allowlist-codegen)) so it follows each codegen run. With no `persistedDocuments`, use `ids: 'name'`.

## `RIVA_DATA_*` refusals from the `/_data` route

Raised by `dataRoute` (`@softistx/riva-react-router/server`) and rethrown by `bffTransport` as a `RivaRequestError` with that `code` and `status`. The checks run in this order:

| Code | Status | When | Fix |
|---|---|---|---|
| `RIVA_DATA_METHOD` | 405 | A GET, or any method but POST | Call it through `bffTransport`; never link to it. |
| `RIVA_DATA_CROSS_SITE` | 403 | `Origin` is not the route's origin, or `Sec-Fetch-Site` is cross-site | Call from the same origin; behind a proxy set `origin` on `dataRoute`. |
| `RIVA_DATA_MEDIA_TYPE` | 415 | `content-type` is not `application/json` | Do not override the header in `bffTransport`'s `headers`. |
| `RIVA_DATA_TOO_LARGE` | 413 | The body is over `maxBytes` (262144) | Send less, or raise `maxBytes`. |
| `RIVA_DATA_BAD_REQUEST` | 400 | The body is not `{ "id": string, "variables"?: object }` | Use `bffTransport`. |
| `RIVA_DATA_UNKNOWN` | 404 | No source knows the id | See below. |
| `RIVA_DATA_INTERNAL` | 500 | An operation threw something that is not a `RivaRequestError` | The browser sees only this generic answer; read the cause through `dataRoute`'s `onError`, which also receives the API's network and HTTP failures (sent to the browser with their own code and the message "The API is unavailable."). |

## `The data route answered <status> with a body that is not JSON.`

Code: `RIVA_INVALID_RESPONSE` (`RivaRequestError`), or `RivaHttpError` (`HTTP_<status>`) when the body is JSON without the route's `{ error }` shape.

**When:** `bffTransport` got a reply `dataRoute` did not write: a proxy's 502 or 504 HTML page, a login redirect, a CDN error, or a `/_data` URL that no route serves.

**Why:** the transport reads `{ data }` or `{ error: { code, message, status } }`; anything else is not the route's answer, so it keeps the HTTP status and nothing of the body.

**Fix:** check that `url` is the route's path and that the proxy forwards POSTs to it untouched. 5xx, 408 and 429 are marked retryable, so the query retries on its own.

## 404 on an operation that exists

**When:** `RIVA_DATA_UNKNOWN` for a query or mutation the app defines.

**Why:** the id the browser sends (the document's `__meta__.hash`, else its operation name) is not a key of the manifest. Either the manifest is stale, or it was built with the other `ids` mode (`'persisted'` keys by hash, `'name'` by operation name).

**Fix:** rebuild the manifest from codegen's `afterAllFileWrite` hook with the `ids` mode that matches the documents (see "Allowlist codegen" in the [README](../README.md#allowlist-codegen)).

## `ENOENT` or a `SyntaxError` from `writeAllowlist` reading `persisted-documents.json`

**When:** `writeAllowlist` (or the `afterAllFileWrite` hook running it) fails with a missing file, or invalid JSON.

**Why:** the client preset writes `persisted-documents.json` only with `persistedDocuments: true`, and `writeAllowlist` reads it. The hook runs after all files are written, so a failed or partial codegen run, a wrong path or a preset without the option leaves nothing valid to read.

**Fix:** set `presetConfig: { persistedDocuments: true }` on the preset, check that the path passed to `writeAllowlist` is the preset's output folder plus `persisted-documents.json`, and fix the codegen error that came first.

## Two definitions share the id "<id>": define each query once (a module-level const) and import it, or pass a distinct id.

Code: `RIVA_KEY` (`RivaError`).

**Why:** a definition's `id` is the document's persisted id, else its operation name. Two definitions with the same `id` read on one riva on the server throw `RIVA_KEY`; in a browser a hot reload takes over instead.

**Fix:** define each query once, as a module-level const, and import it. Pass a distinct `id` when you define one document twice with different options. See the [core entry](../../riva/docs/troubleshooting.md).

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

## `riva-graphql: the document uses the fragment X but does not define it` and `riva-graphql: the document holds no operation`

Code: `RIVA_DEFINITION` (`RivaError`), thrown when `query()` or `mutation()` is called.

**Why:** the document given to `query()` or `mutation()` with a `normalized()` cache spreads a fragment it does not define, or defines no operation.

**Fix:** pass the preset's document, which carries the fragments it uses.

## `riva-graphql: the field "X" selects no __typename, which the cache needs to identify objects: …`

Code: `RIVA_DEFINITION` (`RivaError`), thrown when `query()` or `mutation()` is called with a `normalized()` cache.

**Why:** an object with no `__typename` has no identity, so it could not be stored as an entity. The cache refuses the document rather than rewrite it: a persisted id is the hash of the document's text.

**Fix:** add the client preset's `addTypenameSelectionDocumentTransform` to its `documentTransforms` (or select `__typename` yourself in every selection set below the root).

```ts
// codegen.ts
import { addTypenameSelectionDocumentTransform } from '@graphql-codegen/client-preset';

generates: {
	'app/generated/': {
		preset: 'riva',
		presetConfig: { persistedDocuments: true },
		documentTransforms: [addTypenameSelectionDocumentTransform], // beside `preset`, not inside presetConfig
	},
},
```

## `The cache cannot read the query's data after a fetch.`

Code: `RIVA_CACHE` (`RivaError`), shown as the query's error status; `ensure` rejects with it.

**When:** a query with a `normalized()` cache fetched, and the result still reads as a miss.

**Why:** the server's answer lacks a selected field (or an object the selection needs), so the whole result reads `undefined`: the cache never serves half a result. A second fetch would give the same answer, so it stops instead of looping. A query already showing data whose entity is later evicted is refetched on its own.

**Fix:** have the API return every selected field (`null` for an empty one), or remove it from the selection. The generic explanation is on the [core page](../../riva/docs/troubleshooting.md).

## `This riva already uses other entity identity rules…`

Code: `RIVA_CACHE` (`RivaError`).

**Why:** two `normalized()` (or `entities()`) policies with different `keys` or `identify` were used on one riva.

**Fix:** create one `normalized(options)` and pass it to every definition. The core explains it in [its troubleshooting page](../../riva/docs/troubleshooting.md#this-riva-already-uses-other-entity-identity-rules).

## A query fetches although another query showed the same entity

**Why:** each query entry has its own root: which fields it selected and with which arguments. A query's first fetch is unconditional, and it reads from the store afterwards. Later, a field or entity its selection needs that no write has stored (an argument set not yet fetched: `friends({"first":2})` is not `friends({"first":1})`) makes its data `undefined`, and an observed query refetches once.

**Fix:** expected: the query fetches, then reads from the store.

## `riva-graphql: X is a subscription; run it with riva.graphql.subscribe(), it has no query() or mutation() definition.`

Code: `RIVA_DEFINITION` (`RivaError`), thrown when `query()`, `mutation()` or `infinite()` is given a subscription document (`X` is the operation's name).

**Why:** a definition runs one request and one reply; a subscription is a stream.

**Fix:** use `riva.graphql.subscribe(DOC, vars, { next, error })` from `withGraphQL()` (and read its `state` or `subscribe` to open it), or poll with `refetchEvery`.

## `riva-graphql: this transport cannot subscribe: give withGraphQL() a @softistx/graphql-client client, or a transport with a subscribe method.`

Code: `RIVA_DEFINITION` (`RivaError`), thrown by `riva.graphql.subscribe`.

**Why:** the transport given to `withGraphQL()` has no optional `subscribe(operation, variables, { signal })` method (a BFF transport, a test double).

**Fix:** pass the `@softistx/graphql-client` client (or `graphqlClientTransport(client)`), or add `subscribe` returning an `AsyncIterable` of results that ends when the signal aborts.

## `riva-graphql: X is a query; use query() to define it, not subscription().`

Code: `RIVA_DEFINITION`, from `riva.graphql.subscribe` given a query or mutation document (`X` is the operation's name; the kind in the message follows the document).

**Fix:** use `riva.graphql.query` or `mutate` for it, or give `subscribe` a subscription document.

## A subscription from `riva.graphql.subscribe` never opens

**Why:** it returns a lazy stream resource: nothing opens until a reader subscribes (`feed.subscribe(listener)`, or a computed or effect that reads `feed.state` and is observed), and never on a server. Before 0.3 `subscribe` opened the stream at once and returned a `stop` function.

**Fix:** call `feed.subscribe(listener)` and keep the unsubscribe it returns; the last unsubscribe closes the stream.

## A query shows `error` and keeps `data`

**Why:** the response carried data and errors (a partial result). The state is `error`, `data` is the partial result and `error` is a `RivaGraphQLError`: `error.errors` lists every error with its `path`, and `error.cause` is the client's `ApiError`.

**Fix:** show the partial data and the problem together, or ignore the error when the partial result is enough:

```ts
import { RivaGraphQLError } from '@softistx/riva-graphql';

const s = books.state;
if (s.status === 'error' && s.error instanceof RivaGraphQLError) {
	s.data; // what the API resolved
	s.error.errors.map((e) => e.path?.join('.')); // where it failed
}
```

## A subscription reconnects each time its variables function runs

**Why:** it should not: variables that derive the same key (deep-equal) keep the stream. If it reconnects, the variables differ in some field (a new `Date`, a fresh id).

**Fix:** derive stable variables, or read only the signals the variables depend on.

## A subscription stays `loading` on a server

**Why:** a stream resource is lazy and browser-only: on a server nothing is observed, so it never opens and its state is `loading`.

**Fix:** subscribe in the browser (an effect or a component), and render the `loading` state on the server.

## `The resource is disabled: await it once `enabled` is true.`

Code: `RIVA_DEFINITION` (`RivaError`), the rejection of `await riva.graphql.query(DOC, vars, { enabled })`.

**Why:** `enabled` is false, so the resource is `idle` and has no key to load.

**Fix:** await it once `enabled` is true, or leave `enabled` out for a one-shot `await`.

## `riva-graphql/react: the riva in scope has no GraphQL: create it with createRiva({ graphql: withGraphQL(client) }).`

Code: `RIVA_DEFINITION` (`RivaError`).

**When:** `useGraphQL`, `useGraphQLMutation` or `useGraphQLSubscription` ran under a `RivaProvider` whose riva was made without the extension.

**Fix:**

```ts
const riva = createRiva({ graphql: withGraphQL(client) });
```

A hook outside any provider throws the riva-react `No Riva in scope` error instead (see [riva-react's troubleshooting](https://github.com/softistx/riva/blob/develop/packages/riva-react/docs/troubleshooting.md)).

## A loader's `ensure` and a `useGraphQL(DOC)` component fetch twice

**Why:** `query(DOC)` and `riva.graphql.query(DOC)` / `useGraphQL(DOC)` are two definitions on one riva, so they use separate cache entries (`graphql:<operation id>` for the simple call), and `invalidates: [DOC]` misses the hand-made one.

**Fix:** pass the definition: `const def = query(DOC)`, then `await def.ensure(riva, vars)` in the loader and `useGraphQL(def, vars)` (or `riva.graphql.query(def, vars)`) in the component. The definition is used as is, so both read one entry, and `invalidates: [def]` marks it stale.

## `graphql` is not exported by `@softistx/riva-graphql`

**When:** `import { graphql } from '@softistx/riva-graphql'` fails to compile or resolves to `undefined` (0.7.0 and later).

**Why:** the extension is named `withGraphQL`, so it cannot be mistaken for the client preset's `graphql()` document function, which writes your documents. The same release renamed `GraphQLError` to `RivaGraphQLError` (its `name` too, so a check on `error.name === 'GraphQLError'` fails now), `QueryCall` to `GraphQLQueryCall`, `MutateCall` to `GraphQLMutateCall`, `SubscribeCall` to `GraphQLSubscribeCall`, and dropped `VarsInput` for the core's `TrackedInput`. No old name is kept as an alias.

**Fix:** rename them.

```ts
import { RivaGraphQLError, withGraphQL } from '@softistx/riva-graphql';

const riva = createRiva({ graphql: withGraphQL(client) });
if (error instanceof RivaGraphQLError) error.errors; // match with instanceof, or error.name === 'RivaGraphQLError'
```
