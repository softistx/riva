# Troubleshooting

Each entry is headed by the message you will see.

## `No REST transport on this Riva: call provideRest(riva, httpyzTransport(http, api)) when you create it.`

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** a definition (`query()`, `mutation()`) ran on a `Riva` that was never given a transport. A riva made with `createRiva({ rest: rest(...) })` has one already.

**Why:** the transport lives on the riva, not on the definition, so two server requests never share one.

**Fix:** create the riva with the extension, per request on the server.

```ts
import { createHttpClient } from '@softistx/httpyz';
import { createOpenApiClient } from '@softistx/openapi-httpyz';
import { createRiva } from '@softistx/riva';
import { rest } from '@softistx/riva-rest';
import { operations } from './generated/openapi/operations'; // from `nxgt-openapi generate`

const http = createHttpClient({ baseUrl: 'https://api.example.com' });
const riva = createRiva({ rest: rest(createOpenApiClient(http, operations)) });
```

A riva made with `createRiva()` takes its transport with `provideRest(riva, httpyzTransport(http, api))`, but has no `riva.rest`.

## `The REST transport of this Riva holds no httpyz client: build it with httpyzTransport(http, api).`

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** a free fetcher read `http` from its context, and the transport is a custom one with no `http`.

**Fix:** use `httpyzTransport(http, api?)`, or give your transport an `http` member.

## `This REST transport has no OpenAPI client: build it with httpyzTransport(http, api) to run OpenAPI definitions.`

Code: `RIVA_REST_UNWIRED` (`RivaRequestError`, never retried).

**When:** an OpenAPI definition (`query(api, 'get /x')`) ran through `httpyzTransport(http)` made without `api`.

**Fix:** pass the client `createOpenApiClient(http, operations)` made as the second argument.

## `riva-rest: the OpenAPI client has no GET /nope.`

Code: `RIVA_REST_UNWIRED` (`RivaRequestError`, never retried), thrown when the query runs.

**Why:** the transport's `api` is not the client the definition came from: it has no operation at that method and path (two specs, or a client made over another `operations` table).

**Fix:** build the transport over the same client the definitions use, with the same `decode` setting: the data types follow the definitions' client, while the call runs on the transport's.

```ts
export const api = createOpenApiClient(http, operations);
provideRest(riva, httpyzTransport(http, api)); // the api the definitions take
```

## `riva-rest: the OpenAPI client has no operation at GET /nope; check the path as the spec writes it.`

Code: `RIVA_DEFINITION` (`RivaError`), thrown when the definition is created.

**Why:** the route is not in the client's operation table. The path is the template as the spec writes it (`/invoices/{id}`, not `/invoices/:id`), and the method is lowercase in the route (`'get /invoices/{id}'`).

**Fix:** copy the route from the spec. TypeScript suggests the routes the spec has.

## `riva-rest: "invoices" is not a route; write it as '<method> <path>' (get /invoices/{id}).`

Code: `RIVA_DEFINITION` (`RivaError`), thrown when the definition is created.

**Fix:** write the method and the path, separated by one space, the path starting with `/`.

## `riva-rest: GET /health only reads; define it with query(), not mutation().`

Code: `RIVA_DEFINITION` (`RivaError`), thrown when the definition is created.

**Fix:** a `GET`, `HEAD` or `OPTIONS` operation is a `query()`. The reverse, `riva-rest: DELETE /x changes data; define it with mutation(), not query().`, is the same rule for `PUT`, `PATCH` and `DELETE`. A `POST` that only reads (a search) is a query.

## `riva-rest: query() needs an id; a function has no name to derive one from.`

Code: `RIVA_DEFINITION` (`RivaError`) (and `riva-rest: mutation() needs an id; …`), thrown when the definition is created.

**Why:** the cache key is the id plus the variables; an OpenAPI route gives one, a free fetcher does not, and a counter would differ between the server and the browser.

**Fix:** give the free fetcher an `id`.

```ts
query({ id: 'todos', fetch: async () => [] as string[] });
```

## `HTTP_404` (`RivaHttpError`)

**When:** the server answered a non-2xx status: one the spec declares (the reply is the error's `cause`, with its `data`), or one it does not (`UndeclaredStatusError` in the cause).

**Why:** a query's data is the 2xx reply, so any other status is a failure. It is retried only for 5xx, 408 and 429.

**Fix:** read the body from `error.cause.data` for a declared reply, or declare the status in the spec.

## `A free fetcher uses httpyz, which is server-only: …`

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** in the browser, with `provideRest(riva, bffTransport())`, a free fetcher (`query({ id, fetch })`) read `http` from its context.

**Why:** the BFF transport posts to `/_data` and holds no httpyz client; a free fetcher is arbitrary code against the API, so it only runs on the server.

**Fix:** run it in a loader (on the server), or describe the call in the OpenAPI spec and define it with `query(api, 'get /path')`, which the browser can run through `/_data`.

## `RIVA_DATA_UNKNOWN` (404) on an operation that exists

Code: `RIVA_DATA_UNKNOWN`, message `Unknown operation.` (`RivaRequestError`, status 404).

**When:** a call through `bffTransport` is answered 404 although the route is in the spec.

**Why:** the id is `rest:<operationId>`, read from the spec's operation table. Either the server's `operations(api)` was built from another spec (a stale generated `operations.ts`, a different version), the route has no `operationId` in the spec (the table is keyed by it: add one), or `operations(api)` is not in `dataRoute({ sources })` at all.

**Fix:** build `operations()` from the same `createOpenApiClient` the browser's definitions use, give the operation an `operationId` and regenerate, and check `sources`.

## `The data route answered N with a body that is not JSON.`

Code: `RIVA_INVALID_RESPONSE` (`RivaRequestError`), not retried. The variant `The data route answered without a "data" field.` is a 2xx JSON body that is not the route's `{ data }`.

**When:** a call through `bffTransport` got HTML or text back (N is the status).

**Why:** the request did not reach `dataRoute`: a proxy or CDN page, a login redirect, the route not mounted (the app's own 404 page), or a wrong `url`.

**Fix:** check the `url` option (default `/_data`), mount `dataRoute` on a route that exports `action`, and look at the response in the browser's network tab.

## Which riva error an httpyz error becomes

See the [error table in the README](../README.md#errors). The entries below add the cause and the fix.

## `RIVA_VALIDATION` and `RIVA_INVALID_RESPONSE` (`RivaRequestError`)

**When:** `openapi-httpyz` validates by default. `RIVA_VALIDATION`: the input breaks the spec (`page: 0` where the minimum is 1), and nothing was sent. `RIVA_INVALID_RESPONSE`: the reply does not match the spec, or has a media type it does not declare.

**Why:** neither is retried, since the same request would fail again.

**Fix:** correct the input, or the spec if the server drifted. The `ValidationError` in `error.cause.failure.issues` lists each issue.

## `RIVA_NETWORK` (`RivaNetworkError`)

**When:** no connection, a refused one, a CORS refusal or a timeout. It is retried per the definition's `retry` ([defaults in the core README](https://github.com/softistx/riva/blob/develop/packages/riva/README.md): 3 in a browser, 0 on the server).

## Traps

Entries with no message of their own, or with one the core throws.

## `This riva already uses other entity identity rules. Share one entities() (or the same options objects) between its queries.`

Code: `RIVA_CACHE`.

**When:** two `restEntities()` calls were used on one riva, even with the same `types`: each call makes a policy of its own.

**Fix:** create the policy once and share that very object between the riva's definitions.

```ts
export const cache = restEntities({ Invoice: { is: (o) => 'number' in o, key: (o) => o['id'] as string } });
```

## An entity does not update the other queries

**Why:** only an object `is` recognises is stored as an entity, and it needs the `key` to return a string or number. An object that already has a `__typename` keeps it.

**Fix:** check `is` against a real response object, and that the queries share the same `restEntities()` policy.

## A recognised object is the wrong type

**Why:** the first type whose `is` matches wins, so a loose check (`'id' in o`) tags every resource as the first type.

**Fix:** make `is` discriminate on something only that resource has.

## A request refuses a field called `__typename`

**Why:** `restEntities` injects `__typename` into the data. Data sent back as a request body, with request validation on, fails on the field.

**Fix:** drop it before sending: `const { __typename, ...body } = invoice`.

## REST and GraphQL entities on one riva

**Why:** a riva holds one set of identity rules, so a REST policy and a GraphQL one cannot share its store in v1.

**Fix:** use the entity policy for one of them, and request-keyed caching (the default) for the other.

## `riva-rest: DELETE /x changes data; define it with mutation(), not query().`

Code: `RIVA_DEFINITION` (`RivaError`), thrown when the definition is created, for a `PUT`, `PATCH` or `DELETE` route given to `query()`.

**Fix:** use `mutation(api, 'delete /x')`. Only `GET`, `HEAD`, `OPTIONS` and a `POST` that only reads (a search) are queries.

## `riva-rest: POST /x is not a mutation; riva.rest.mutation takes post, put, patch or delete.`

Code: `RIVA_DEFINITION` (`RivaError`), thrown by `riva.rest.mutation(method, path)` on an untyped `rest({ baseUrl })` riva given `'get'`, `'head'` or `'options'` (the method in the message is the one you passed).

**Fix:** read with `riva.rest.get(path)`; keep `mutation` for `post`, `put`, `patch` and `delete`. With a spec, the same mistake is a compile error and, at runtime, `riva-rest: GET /x only reads; define it with query(), not mutation().`

## `riva-rest: /things/{id} needs param.id.`

Code: `RIVA_VALIDATION` (`RivaRequestError`, not retryable), thrown by the `rest({ baseUrl })` transport before any request: the path has a `{id}` placeholder and the input has no `param.id`.

**Fix:** give it, `riva.rest.get('/things/{id}', { param: { id: '42' } })`, or write the value in the path (`'/things/42'`). With a spec, the compiler asks for `param` and httpyz validates it.

## A `riva.rest.get(...)` never fetches

**Why:** it returns a lazy resource: nothing is requested until a reader subscribes (`resource.subscribe(listener)`, or a computed or effect that reads `resource.state` and is observed) or you `await` it, and never on a server, where `await` is the way to load.

**Fix:** `await riva.rest.get(...)` for a one-shot load, or keep the unsubscribe `subscribe` returns for a live one.

## An `invalidates` path refetches nothing

**Why:** a string in `invalidates` is the path of a `riva.rest.get`, as the spec writes it (`'/invoices/{id}'`, with the placeholder, for every input of it); with `rest({ baseUrl })` it is the URL path you passed to `get` (`'/invoices/42'`). A query made with `query(api, route)` has its own entries and is not reached by a string (unless the `get` was given that definition: `riva.rest.get(def, input)` reads the definition's entries).

**Fix:** pass the same path as the `get`, or the definition (`invalidates: [invoicesQuery]`) or `at(invoicesQuery, vars)` for a hand-made one. A path the spec has no `get` for throws `riva-rest: the OpenAPI client has no operation at GET /x; …` before the mutation runs.

## `GET /x: the reply is not JSON.`

Code: `RIVA_INVALID_RESPONSE` (`RivaRequestError`, not retryable), from the `rest({ baseUrl })` transport on a 2xx reply whose body is not JSON (an HTML login page, a proxy error). An empty body is `undefined`, not an error.

**Fix:** check the URL and the `accept` header (`application/json` is sent unless your `headers` set another), or use a spec client, which decodes by content type.

## `riva-rest: param.id of /things/{id} must not be empty, "." or "..".`

Code: `RIVA_VALIDATION` (`RivaRequestError`, not retryable), from the `rest({ baseUrl })` transport before any request: such a value (also as `%2e`) would collapse the path to another URL.

**Fix:** pass a real identifier.

## `riva-rest/react: the riva in scope has no REST: create it with createRiva({ rest: rest(api) }).`

Code: `RIVA_DEFINITION` (`RivaError`).

**When:** `useRest` or `useRestMutation` ran under a `RivaProvider` whose riva was made without the extension.

**Fix:**

```ts
const riva = createRiva({ rest: rest({ baseUrl: "https://api.example.com" }) });
```

A hook outside any provider throws the riva-react `No Riva in scope` error instead.

## A loader's `ensure` and a `useRest('get', path)` component fetch twice

**Why:** `query(api, route)` and `riva.rest.get(path)` / `useRest('get', path)` are two definitions on one riva, so they use separate cache entries (`rest:<method> <path>` for the simple call).

**Fix:** pass the definition: `const def = query(api, 'get /invoices/{id}')`, then `await def.ensure(riva, input)` in the loader and `useRest(def, input)` (or `riva.rest.get(def, input)`) in the component. The definition is used as is, so both read one entry, and `invalidates: [def]` marks it stale.
