# BFF mode

Entry points: `@softistx/riva-rest/server` (server) and `@softistx/riva-rest/bff` (browser).

## What it is for

Run the REST calls on the server and keep the browser away from the API: the browser posts `{ id, variables }` to a `dataRoute` (`@softistx/riva-react-router`'s `/_data`), the server runs the operation through the request riva's transport (with its session and base URL) and sends the data back.

## Server

The middleware gives each request riva its transport, and the `/_data` route serves the spec's operations.

```ts
// app/api.ts: shared by the definitions and the route
import { createHttpClient } from '@softistx/httpyz';
import { createOpenApiClient } from '@softistx/openapi-httpyz';
import { operations } from './generated/openapi/operations';

export const BASE_URL = 'https://api.example.com';
export const api = createOpenApiClient(createHttpClient({ baseUrl: BASE_URL }), operations);
```

```ts
// app/root.tsx: the request riva's transport
import { createHttpClient } from '@softistx/httpyz';
import { createOpenApiClient } from '@softistx/openapi-httpyz';
import { rivaMiddleware } from '@softistx/riva-react-router/server';
import { httpyzTransport, provideRest } from '@softistx/riva-rest';
import { BASE_URL } from './api';
import { operations } from './generated/openapi/operations';

export const middleware = [
	rivaMiddleware({
		// the caller port of the request: here its session cookie goes to the API
		setup: (riva, { request }) => {
			const http = createHttpClient({
				baseUrl: BASE_URL,
				headers: { cookie: request.headers.get('cookie') ?? '' },
			});
			provideRest(riva, httpyzTransport(http, createOpenApiClient(http, operations)));
		},
	}),
];
```

```ts
// app/routes/_data.ts
import { dataRoute } from '@softistx/riva-react-router/server';
import { operations } from '@softistx/riva-rest/server';
import { api } from '../api';

const route = dataRoute({ sources: [operations(api)] });
export const action = route.action;
export const loader = route.loader; // 405
```

## Browser

The same definitions, another transport, provided in the router provider's `setup`.

```tsx
import { RivaRouterProvider } from '@softistx/riva-react-router';
import { provideRest } from '@softistx/riva-rest';
import { bffTransport } from '@softistx/riva-rest/bff';
import { Outlet } from 'react-router';

export default function Root() {
	return (
		<RivaRouterProvider setup={(riva) => provideRest(riva, bffTransport())}>
			<Outlet />
		</RivaRouterProvider>
	);
}
```

## Options

`bffTransport(options?)`:

| Option | Default | Meaning |
|---|---|---|
| `url` | `/_data` | The data route. |
| `fetch` | global `fetch` | A fetch of your own. |
| `headers` | none | A function returning `HeadersInit`, called at each request (a CSRF token). |

Same-origin cookies go with each call. `operations(api)` takes the OpenAPI client; a GET, HEAD or OPTIONS is a query, any other method a mutation.

## Traps

- **Ids are `rest:<operationId>`**: the spec's `operationId` (`rest:getInvoice`), not the route. An id the spec lacks is a 404 (`RIVA_DATA_UNKNOWN`). The browser never sends a URL or a method.
- **Free fetchers are server-only**: reading `http` from a free fetcher's context with `bffTransport` throws `RivaScopeError`. Run them in a loader, or describe the call in the spec. `operations()` does not serve them.
- Errors come back as the core's classes (`postData` of `@softistx/riva/data` maps them): `RivaRequestError` with the route's `code` and `status` (retried for 5xx, 408, 429), `RivaNetworkError`, `RivaAbortError`, `RIVA_INVALID_RESPONSE`.
