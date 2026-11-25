# Troubleshooting

Each entry is headed by the message you will see.

## `No REST transport on this RivaClient: call provideRest(client, httpyzTransport(http, api)) when you create it.`

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** a query or mutation ran on a `RivaClient` that was never given a transport.

**Why:** definitions are stateless and the transport lives on the client, so two server requests never share one.

**Fix:** provide it where the client is created, per request on the server.

```ts
import { createHttpClient } from '@softistx/httpyz';
import { createRivaClient } from '@softistx/riva';
import { httpyzTransport, provideRest } from '@softistx/riva-rest';

const http = createHttpClient({ baseUrl: 'https://api.example.com' });
const client = createRivaClient();
provideRest(client, httpyzTransport(http));
```

## `The REST transport of this RivaClient holds no httpyz client: build it with httpyzTransport(http, api).`

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
provideRest(client, httpyzTransport(http, api)); // the api the definitions take
```

## `riva-rest: the OpenAPI client has no operation at GET /nope; check the path as the spec writes it.`

A `TypeError`, thrown when the definition is created.

**Why:** the route is not in the client's operation table. The path is the template as the spec writes it (`/invoices/{id}`, not `/invoices/:id`), and the method is lowercase in the route (`'get /invoices/{id}'`).

**Fix:** copy the route from the spec. TypeScript suggests the routes the spec has.

## `riva-rest: "invoices" is not a route; write it as '<method> <path>' (get /invoices/{id}).`

A `TypeError`, thrown when the definition is created.

**Fix:** write the method and the path, separated by one space, the path starting with `/`.

## `riva-rest: GET /health only reads; define it with query(), not mutation().`

A `TypeError`, thrown when the definition is created.

**Fix:** a `GET`, `HEAD` or `OPTIONS` operation is a `query()`. The reverse, `riva-rest: DELETE /x changes data; define it with mutation(), not query().`, is the same rule for `PUT`, `PATCH` and `DELETE`. A `POST` that only reads (a search) is a query.

## `riva-rest: query() needs an id; a function has no name to derive one from.`

A `TypeError` (and `riva-rest: mutation() needs an id; …`), thrown when the definition is created.

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

**When:** in the browser, with `provideRest(client, bffTransport())`, a free fetcher (`query({ id, fetch })`) read `http` from its context.

**Why:** the BFF transport posts to `/_data` and holds no httpyz client; a free fetcher is arbitrary code against the API, so it only runs on the server.

**Fix:** run it in a loader (on the server), or describe the call in the OpenAPI spec and define it with `query(api, 'get /path')`, which the browser can run through `/_data`.

## `Unknown operation.` (`RIVA_DATA_UNKNOWN`, 404) on an operation that exists

**When:** a call through `bffTransport` is answered 404 although the route is in the spec.

**Why:** the id is `rest:<operationId>`, read from the spec's operation table. The server's `operations(api)` was built from another spec (a stale generated `operations.ts`, a different version), or the route is not in `dataRoute({ sources })` at all.

**Fix:** build `operations()` from the same `createOpenApiClient` the browser's definitions use, and check the `operationId` in both specs.

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

## `This client already uses other entity identity rules. Share one entities() (or the same options objects) between its queries.`

Code: `RIVA_CACHE`.

**When:** two `restEntities()` calls were used on one client, even with the same `types`: each call makes a policy of its own.

**Fix:** create the policy once and share that very object between the client's definitions.

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

## REST and GraphQL entities on one client

**Why:** a client holds one set of identity rules, so a REST policy and a GraphQL one cannot share its store in v1.

**Fix:** use the entity policy for one of them, and request-keyed caching (the default) for the other.
