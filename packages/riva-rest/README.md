# @softistx/riva-rest

REST for [riva](https://github.com/softistx/riva/blob/develop/packages/riva/README.md): `query` and `mutation` definitions typed from an OpenAPI spec through [`@softistx/openapi-httpyz`](https://github.com/softistx/nxgt-http/tree/develop/packages/openapi-httpyz) (path parameters, query, body and reply, never annotated), a free-fetcher mode for APIs with no schema, a per-client transport over [`@softistx/httpyz`](https://github.com/softistx/nxgt-http/tree/develop/packages/httpyz), and httpyz's errors mapped to riva's.

Errors and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).

```sh
bun add @softistx/riva @softistx/riva-rest @softistx/httpyz @softistx/openapi-httpyz zod
bun add -d @softistx/openapi-codegen typescript
```

Peers: `@softistx/riva` and `@softistx/httpyz`. `@softistx/openapi-httpyz` is optional: only the OpenAPI mode needs it. `@softistx/openapi-codegen` writes the operations table at build time, and that generated `operations.ts` imports `zod`. The runtime entries import none of them.

## Provide the transport

Definitions are stateless; the transport lives on the `RivaClient` that runs them. Give each client one when you create it (on the server, one per request).

The OpenAPI mode reads the operations the spec describes, which `@softistx/openapi-codegen` generates:

```sh
bunx nxgt-openapi generate -i openapi.yaml   # writes generated/openapi
```

Then, in `api.ts`:

```ts
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

`httpyzTransport(http, api?)`: pass `api` for the OpenAPI mode; without it only free fetchers run. The httpyz client's middleware, auth, retries and timeouts apply to every call. A read on a client with no transport throws `RivaScopeError` (the SSR leak guard): there is no module-level client.

## OpenAPI mode

`query(api, 'method path', options?)`: the route is the one the spec writes (`'get /invoices/{id}'`), checked at compile time and when the definition is created. The variables are the operation's input (`param`, `query`, `json`, …), the data is its 2xx reply, both from the spec.

```ts
import { mutation, query } from '@softistx/riva-rest';
import { api } from './api';

export const invoice = query(api, 'get /invoices/{id}', { staleTime: '30s' });
export const invoices = query(api, 'get /invoices');
export const createInvoice = mutation(api, 'post /invoices', { invalidates: [invoices] });

await invoice.ensure(client, { param: { id: '7' } }); // Invoice
await createInvoice.run(client, { json: { number: 'F-8', total: 120 } });
client.get(invoices); // an operation whose input is all optional takes no variables
```

- **The id is the route** (`get /invoices/{id}`), the cache key is the id plus the stable-serialized input: never hand-written. Pass `id` in the options to define one route twice.
- **Any core option** works: `staleTime`, `gcTime`, `retry`, `refetchEvery`, `cache`, and for a mutation `optimistic`, `updates`, `invalidates`.
- **The data is typed as the client returns it**: decoded for `decode: true` (the default), as JSON carries it for `decode: false`. It is read off the client you pass, so there is nothing to annotate.
- **The routes are narrowed by kind**: `query()` takes every route but `put`, `patch` and `delete` (`QueryRoute`), `mutation()` every one but `get`, `head` and `options` (`MutationRoute`); the wrong one is a compile error and a `TypeError` at definition time. A `POST` that only reads (a search) is a query.
- **Defaults** (`staleTime`, `gcTime`, `retry`: 3 in a browser, 0 on the server) are the core's: see the [options in the core README](https://github.com/softistx/riva/blob/develop/packages/riva/README.md).
- `rest.query` and `rest.mutation` are the same functions, for the `rest.query(api, 'get /invoices/{id}')` spelling.
- Cancel with `ensure(client, vars, { signal })`: the signal reaches the request, and an abort is a `RivaAbortError`.

## Free fetcher

For an API with no schema, write the function: its types are the definition's types.

```ts
import { mutation, query } from '@softistx/riva-rest';

type Todo = { id: string; title: string; done: boolean };

export const todos = query({
	id: 'todos',
	fetch: async (vars: { done?: boolean }, { http, signal }) => {
		const reply = await http.get('/todos', { query: vars, signal });
		return reply.data as Todo[];
	},
});

export const renameTodo = mutation({
	id: 'renameTodo',
	run: async (vars: { id: string; title: string }, { http, signal }) =>
		(await http.patch('/todos/{id}', { param: { id: vars.id }, json: { title: vars.title }, signal })).data as Todo,
});
```

- **`id` is required**: a function has no name to derive a key from.
- The context is the core's (`signal`, `client`) plus `http`, the httpyz client of the transport. It is read lazily: a fetcher that never touches `http` (a plain `fetch`) needs no transport.
- What the fetcher throws from httpyz is mapped to riva's errors, as below.

## Errors

The transport and the free fetcher throw riva's errors, defined once in the core so `instanceof` holds.

| httpyz | riva | retried |
| --- | --- | --- |
| a status the spec declares, not 2xx | `RivaHttpError` (`HTTP_404`, the reply is its `cause`) | 5xx, 408, 429 |
| `UndeclaredStatusError`, `ReplyStatusError` | `RivaHttpError` | 5xx, 408, 429 |
| `NetworkError`, `TimeoutError` | `RivaNetworkError` | yes |
| `ValidationError` on the request | `RivaRequestError` `RIVA_VALIDATION` | no |
| `ValidationError` on the reply | `RivaRequestError` `RIVA_INVALID_RESPONSE` | no |
| the caller's abort | `RivaAbortError` | no |
| a transport with no OpenAPI client, or one that lacks the operation | `RivaRequestError` `RIVA_REST_UNWIRED` | no |

Only httpyz's own errors are mapped (they carry the `method` and `path` of their call): a `ValidationError` or a `TimeoutError` from another library passes through unchanged.

`toRivaError(error, signal?)` is exported for your own transports. See [troubleshooting](./docs/troubleshooting.md).

## BFF mode

Run the REST calls on the server and keep the browser away from the API: the browser posts `{ id, variables }` to a `dataRoute` (`@softistx/riva-react-router`'s `/_data`), the server runs the operation through the request client's transport (with its session and base URL) and sends the data back.

Server: the middleware gives each request client its transport, and the `/_data` route serves the spec's operations. `./generated/openapi/operations` is schematic: the table `nxgt-openapi generate` writes for your spec.

```ts
// app/api.ts: shared by the definitions (`query(api, ...)`) and the route
import { createHttpClient } from '@softistx/httpyz';
import { createOpenApiClient } from '@softistx/openapi-httpyz';
import { operations } from './generated/openapi/operations';

export const BASE_URL = 'https://api.example.com';
export const api = createOpenApiClient(createHttpClient({ baseUrl: BASE_URL }), operations);
```

```ts
// app/root.tsx: the request client's transport
import { createHttpClient } from '@softistx/httpyz';
import { createOpenApiClient } from '@softistx/openapi-httpyz';
import { rivaMiddleware } from '@softistx/riva-react-router/server';
import { httpyzTransport, provideRest } from '@softistx/riva-rest';
import { BASE_URL } from './api';
import { operations } from './generated/openapi/operations';

export const middleware = [
	rivaMiddleware({
		// the caller port of the request: here its session cookie goes to the API
		setup: (client, { request }) => {
			const http = createHttpClient({
				baseUrl: BASE_URL,
				headers: { cookie: request.headers.get('cookie') ?? '' },
			});
			provideRest(client, httpyzTransport(http, createOpenApiClient(http, operations)));
		},
	}),
];
```

```ts
// app/routes/_data.ts: the route
import { dataRoute } from '@softistx/riva-react-router/server';
import { operations } from '@softistx/riva-rest/server';
import { api } from '../api';

const route = dataRoute({ sources: [operations(api)] });
export const action = route.action;
export const loader = route.loader; // 405
```

Browser: the same definitions (`query(api, 'get /invoices/{id}')`), another transport, provided in the router provider's `setup`.

```tsx
// app/root.tsx
import { RivaRouterProvider } from '@softistx/riva-react-router';
import { provideRest } from '@softistx/riva-rest';
import { bffTransport } from '@softistx/riva-rest/bff';
import { Outlet } from 'react-router';

export default function Root() {
	return (
		<RivaRouterProvider setup={(client) => provideRest(client, bffTransport())}>
			<Outlet />
		</RivaRouterProvider>
	);
}
```

- **Ids are `rest:<operationId>`**: the spec's `operationId` (`rest:getInvoice`), not the route. An id the spec lacks is a 404 (`RIVA_DATA_UNKNOWN`). The browser never sends a URL or a method.
- `operations(api)` takes the OpenAPI client (`createOpenApiClient`). A GET, HEAD or OPTIONS is a query, any other method a mutation. Free fetchers are not served by it: they run on the server through `provideRest(client, httpyzTransport(http))`, never through `bffTransport`.
- `bffTransport({ url?, fetch?, headers? })`: `url` defaults to `/_data`, `headers` is a function (a CSRF token), `fetch` defaults to the global one. Same-origin cookies go with each call.
- Errors come back as the core's classes (`postData` of `@softistx/riva/data` maps them: `RivaRequestError` with the route's `code` and `status`, retried for 5xx, 408 and 429; `RivaNetworkError`, `RivaAbortError`, `RIVA_INVALID_RESPONSE`), so `instanceof` holds.
- **Free fetchers are server-only**: they use httpyz, which the browser does not have. Reading `http` from a free fetcher's context with `bffTransport` throws `RivaScopeError`. Run them in a loader, or describe the call in the spec.

## Cache

By default an entry is keyed by request: the route and its input. To share resources between queries, opt in to entities from `@softistx/riva-rest/entities`: each object you recognise is stored once, and a refetch or a mutation result updates every query that shows it.

```ts
import { query, mutation } from '@softistx/riva-rest';
import { restEntities } from '@softistx/riva-rest/entities';
import { api } from './api';

// One policy for the client's queries and mutations.
export const cache = restEntities({
	Invoice: { is: (o) => 'number' in o, key: (o) => o['id'] as string },
});

export const invoice = query(api, 'get /invoices/{id}', { cache });
export const invoices = query(api, 'get /invoices', { cache });
export const createInvoice = mutation(api, 'post /invoices', { cache });
```

`is` says whether an object of a response is that type (REST has no `__typename`), `key` gives its id. Recognised objects get a `__typename`, so data readers see carries it; the core's `readEntity('Invoice:7')`, `writeEntity` and `invalidateEntity` work on them. `restEntities(types, { identify })` also takes the core's `identify` to replace the identity rule altogether.

Pitfalls:

- **Share the `restEntities()` result itself**, not its arguments: two calls throw `RIVA_CACHE` on one client, even with the same `types`.
- **`is` must tell the types apart**: the first type that matches wins, so `'id' in o` for two resources tags both as the first one.
- **The injected `__typename` shows up in the data.** Send it back to the API (an edit form's value as a request body) and request validation fails on the unknown field: drop it first.
- **REST and GraphQL policies cannot share one client's store** in v1: a client holds one set of identity rules.

## Entry points

- `@softistx/riva-rest`: `query`, `mutation`, `rest` (`{ query, mutation }`), `provideRest`, `httpyzTransport`, `toRivaError`, `operationOf` (reads a route into `{ id, method, path, operationId, hasInput }`) and the types: `RestTransport`, `RestContext`, `Route`, `Operation`, the options (`RestQueryOptions`, `RestMutationOptions`, `FreeQueryOptions`, `FreeMutationOptions`), the routes (`RouteOf`, `QueryRoute`, `MutationRoute`) and `InputOf`, `DataOf`, `SpecOf`, `ClientOf`, `DecodedOf`.
- `@softistx/riva-rest/entities`: `restEntities` and the types `RestEntity`, `RestEntities`.
- `@softistx/riva-rest/server`: `operations(api)` (a `DataSource` for `dataRoute`) and the types `DataSource`, `DataOperation`, `OperationsOf`.
- `@softistx/riva-rest/bff`: `bffTransport(opts)` and the type `BffTransportOptions`.

Size: riva + riva-rest stays under 8 kB gzipped, and riva + `/bff` under 9 kB, httpyz and openapi-httpyz not counted.
