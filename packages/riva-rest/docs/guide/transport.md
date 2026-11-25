# Transport

## What it is for

Definitions are stateless; the transport lives on the `RivaClient` that runs them. Give each client one when you create it (on the server, one per request).

## OpenAPI mode wiring

The OpenAPI mode reads the operations the spec describes, which `@softistx/openapi-codegen` generates:

```sh
bunx nxgt-openapi generate -i openapi.yaml   # writes generated/openapi
```

```ts
// api.ts
import { createHttpClient } from '@softistx/httpyz';
import { createOpenApiClient } from '@softistx/openapi-httpyz';
import { createRivaClient } from '@softistx/riva';
import { httpyzTransport, provideRest } from '@softistx/riva-rest';
import { operations } from './generated/openapi/operations'; // from `nxgt-openapi generate`

const http = createHttpClient({ baseUrl: 'https://api.example.com', timeout: 10_000 });
export const api = createOpenApiClient(http, operations);

export const client = createRivaClient();
provideRest(client, httpyzTransport(http, api));
```

## `httpyzTransport(http, api?)`

| Argument | Meaning |
|---|---|
| `http` | The httpyz client. Its middleware, auth, retries and timeouts apply to every call. |
| `api` | The OpenAPI client (`createOpenApiClient`). Pass it for the OpenAPI mode; without it only [free fetchers](./free-fetcher.md) run. |

## Free-fetcher-only wiring

```ts
provideRest(client, httpyzTransport(http)); // no spec: free fetchers only
```

## Traps

- A read on a client with no transport throws `RivaScopeError` (the SSR leak guard): there is no module-level client. Provide it where you create the client.
- A transport with no OpenAPI client cannot run an OpenAPI definition: it fails with `RIVA_REST_UNWIRED`.
- On the server, create the `http` client inside the request, so its headers (a cookie) belong to that request.

Fixes: [troubleshooting](../troubleshooting.md).
