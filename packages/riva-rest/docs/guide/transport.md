# Transport

## What it is for

The transport lives on the `Riva` that runs the calls. `rest(api)` installs it when you create the riva (on the server, one riva per request).

## OpenAPI mode wiring

The OpenAPI mode reads the operations the spec describes, which `@softistx/openapi-codegen` generates:

```sh
bunx nxgt-openapi generate -i openapi.yaml   # writes generated/openapi
```

```ts
// api.ts
import { createHttpClient } from '@softistx/httpyz';
import { createOpenApiClient } from '@softistx/openapi-httpyz';
import { createRiva } from '@softistx/riva';
import { rest } from '@softistx/riva-rest';
import { operations } from './generated/openapi/operations'; // from `nxgt-openapi generate`

const http = createHttpClient({ baseUrl: 'https://api.example.com', timeout: 10_000 });
export const api = createOpenApiClient(http, operations); // the client the definitions take too

export const riva = createRiva({ rest: rest(api) });
```

With no spec, `rest({ baseUrl, headers? })` gives the untyped calls over `fetch` ([simple API](./simple-api.md)).

## `provideRest` and `httpyzTransport(http, api?)`

A riva made without the extension (`createRiva()`) gets its transport from `provideRest(riva, httpyzTransport(http, api))`. Only [definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md) run on it: it has no `riva.rest`. The browser's BFF transport is provided this way ([BFF mode](./bff.md)).

| Argument | Meaning |
|---|---|
| `http` | The httpyz client. Its middleware, auth, retries and timeouts apply to every call. |
| `api` | The OpenAPI client (`createOpenApiClient`). Pass it for the OpenAPI mode; without it only [free fetchers](./free-fetcher.md) run. |

## Free-fetcher-only wiring

```ts
import { createRiva } from '@softistx/riva';
import { httpyzTransport, provideRest } from '@softistx/riva-rest';

const riva = createRiva();
provideRest(riva, httpyzTransport(http)); // no spec: free fetchers only
```

## Traps

- A read on a riva with no transport throws `RivaScopeError` (the SSR leak guard): there is no module-level riva. Create the riva with `rest(...)`, or `provideRest` it where you create it.
- A transport with no OpenAPI client cannot run an OpenAPI definition: it fails with `RIVA_REST_UNWIRED`.
- On the server, create the `http` client inside the request, so its headers (a cookie) belong to that request.

Fixes: [troubleshooting](../troubleshooting.md).
