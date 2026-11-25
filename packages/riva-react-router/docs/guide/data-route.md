# The `/_data` route

Entry point: `@softistx/riva-react-router/server`.

## What it is for

`dataRoute` lets the browser run allowlisted operations through your server, with the session of the request. Mount it on a route with an action; the browser's `bffTransport` (`@softistx/riva-graphql/bff` or `@softistx/riva-rest/bff`) posts to it.

## GraphQL

```ts
// app/routes/_data.ts
import { dataRoute } from '@softistx/riva-react-router/server';
import type { AllowlistManifest } from '@softistx/riva-graphql/codegen';
import { allowlist } from '@softistx/riva-graphql/server';
import manifest from '../generated/allowlist.json';

const route = dataRoute({
	sources: [allowlist(manifest as AllowlistManifest)],
});
export const action = route.action;
export const loader = route.loader; // 405
```

## REST, or both

```ts
import { operations } from '@softistx/riva-rest/server';

const route = dataRoute({
	sources: [allowlist(manifest as AllowlistManifest), operations(api)],
});
```

## Options

| Option | Default | Meaning |
|---|---|---|
| `sources` | required | `DataSource[]`, asked in order: the first that knows the id runs it. |
| `origin` | the request's own origin | The one allowed origin; set it behind a proxy. |
| `maxBytes` | `262144` | Largest request body accepted. |
| `onError(error, request)` | none | What a non-`RivaRequestError` threw, or a network or HTTP failure of the API. The browser only sees a generic answer. |

## Refusals

Refusals are `{ error: { code, message, status } }` with `RIVA_DATA_*` codes (the `DataRouteCode` type):

| Code | Status | When |
|---|---|---|
| `RIVA_DATA_METHOD` | 405 | Not a POST (a GET hits the loader). |
| `RIVA_DATA_CROSS_SITE` | 403 | The origin is not the allowed one. |
| `RIVA_DATA_MEDIA_TYPE` | 415 | The body is not JSON. |
| `RIVA_DATA_TOO_LARGE` | 413 | The body passes `maxBytes`. |
| `RIVA_DATA_BAD_REQUEST` | 400 | Malformed body, or variables that cannot be decoded. |
| `RIVA_DATA_UNKNOWN` | 404 | No source knows the id. |
| `RIVA_DATA_INTERNAL` | 500 | An unexpected failure; see `onError`. |

## Traps

- A JSON import widens `kind` to `string`: assert the manifest's type (`manifest as AllowlistManifest`).
- Behind a proxy the request's origin may differ from the browser's: set `origin`.
- An unknown id is a 404 even for an operation that exists: the id is the persisted id (GraphQL) or `rest:<operationId>` (REST), regenerate the allowlist after changing a document.

Fixes: [troubleshooting](../troubleshooting.md).
