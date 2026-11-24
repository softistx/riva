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

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** an OpenAPI definition (`query(api, 'get /x')`) ran through `httpyzTransport(http)` made without `api`.

**Fix:** pass the client `createOpenApiClient(http, operations)` made as the second argument.

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

## `RIVA_VALIDATION` and `RIVA_INVALID_RESPONSE` (`RivaRequestError`)

**When:** `openapi-httpyz` validates by default. `RIVA_VALIDATION`: the input breaks the spec (`page: 0` where the minimum is 1), and nothing was sent. `RIVA_INVALID_RESPONSE`: the reply does not match the spec, or has a media type it does not declare.

**Why:** neither is retried, since the same request would fail again.

**Fix:** correct the input, or the spec if the server drifted. The `ValidationError` in `error.cause.failure.issues` lists each issue.

## `RIVA_NETWORK` (`RivaNetworkError`)

**When:** no connection, a refused one, a CORS refusal or a timeout. It is retried per the definition's `retry` (3 in a browser, 0 on the server).

## Data of a client made with `decode: false` is typed wrong

**Why:** the definitions type the data as the default client decodes it (a date-time is a `Date`). With `decode: false` the reply is as JSON carries it.

**Fix:** use the free-fetcher mode with your own types, or keep `decode: true`.

## `This client already uses other entity identity rules. Share one entities() (or the same options objects) between its queries.`

Code: `RIVA_CACHE`.

**When:** two `restEntities()` calls with their own rules were used on one client.

**Fix:** create the policy once and share it between the client's definitions.

```ts
export const cache = restEntities({ Invoice: { is: (o) => 'number' in o, key: (o) => o['id'] as string } });
```

## An entity does not update the other queries

**Why:** only an object `is` recognises is stored as an entity, and it needs the `key` to return a string or number. An object that already has a `__typename` keeps it.

**Fix:** check `is` against a real response object, and that the queries share the same `restEntities()` policy.
