# @softistx/riva-rest

REST for [riva](https://github.com/softistx/riva/blob/develop/packages/riva/README.md): `query` and `mutation` definitions typed from an OpenAPI spec through [`@softistx/openapi-httpyz`](https://github.com/softistx/nxgt-http/tree/develop/packages/openapi-httpyz) (path parameters, query, body and reply, never annotated), a free-fetcher mode for APIs with no schema, a per-riva transport over [`@softistx/httpyz`](https://github.com/softistx/nxgt-http/tree/develop/packages/httpyz), and httpyz's errors mapped to riva's.

Guides and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).

```sh
bun add @softistx/riva @softistx/riva-rest @softistx/httpyz @softistx/openapi-httpyz zod
bun add -d @softistx/openapi-codegen typescript
```

Peers: `@softistx/riva` and `@softistx/httpyz`. `@softistx/openapi-httpyz` is optional: only the OpenAPI mode needs it. `@softistx/openapi-codegen` writes the operations table at build time, and that generated `operations.ts` imports `zod`. The runtime entries import none of them.

## Provide the transport

Definitions are stateless; the transport lives on the `Riva` that runs them. Give each riva one when you create it (on the server, one per request).

The OpenAPI mode reads the operations the spec describes, which `@softistx/openapi-codegen` generates:

```sh
bunx nxgt-openapi generate -i openapi.yaml   # writes generated/openapi
```

Then, in `api.ts`:

```ts
import { createHttpClient } from '@softistx/httpyz';
import { createOpenApiClient } from '@softistx/openapi-httpyz';
import { createRiva } from '@softistx/riva';
import { httpyzTransport, provideRest } from '@softistx/riva-rest';
import { operations } from './generated/openapi/operations'; // from `nxgt-openapi generate`

const http = createHttpClient({ baseUrl: 'https://api.example.com', timeout: 10_000 });
export const api = createOpenApiClient(http, operations);

export const riva = createRiva();
provideRest(riva, httpyzTransport(http, api));
```

`httpyzTransport(http, api?)`: pass `api` for the OpenAPI mode; without it only free fetchers run. A read on a riva with no transport throws `RivaScopeError`. [Guide](./docs/guide/transport.md).

## OpenAPI mode

`query(api, 'method path', options?)`: the route is the one the spec writes (`'get /invoices/{id}'`), checked at compile time and when the definition is created. The variables are the operation's input (`param`, `query`, `json`, …), the data is its 2xx reply, both from the spec.

```ts
import { mutation, query } from '@softistx/riva-rest';
import { api } from './api';

export const invoice = query(api, 'get /invoices/{id}', { staleTime: '30s' });
export const invoices = query(api, 'get /invoices');
export const createInvoice = mutation(api, 'post /invoices', { invalidates: [invoices] });

await invoice.ensure(riva, { param: { id: '7' } }); // Invoice
await createInvoice.run(riva, { json: { number: 'F-8', total: 120 } });
riva.get(invoices); // an operation whose input is all optional takes no variables
```

The id is the route; any core option works (`staleTime`, `gcTime`, `retry`, `refetchEvery`, `cache`, and for a mutation `optimistic`, `updates`, `invalidates`). `query()` takes every route but `put`, `patch` and `delete`, `mutation()` every one but `get`, `head` and `options`. [Guide](./docs/guide/openapi.md).

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

`id` is required. The context is the core's plus `http`, read lazily. [Guide](./docs/guide/free-fetcher.md).

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

`toRivaError(error, signal?)` is exported for your own transports. [Guide](./docs/guide/errors.md), [troubleshooting](./docs/troubleshooting.md).

## BFF mode

Run the REST calls on the server and keep the browser away from the API: the browser posts `{ id, variables }` to a `dataRoute` (`@softistx/riva-react-router`'s `/_data`), the server runs the operation through the request riva's transport (with its session and base URL) and sends the data back.

Server: `rivaMiddleware({ setup })` gives each request riva its transport, and `dataRoute({ sources: [operations(api)] })` serves the spec's operations. Browser: the same definitions with `provideRest(riva, bffTransport())` in the router provider's `setup`. Ids are `rest:<operationId>`; free fetchers are server-only. [Guide](./docs/guide/bff.md).

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

## Cache

By default an entry is keyed by request: the route and its input. To share resources between queries, opt in to entities from `@softistx/riva-rest/entities`: each object you recognise is stored once, and a refetch or a mutation result updates every query that shows it.

```ts
import { query, mutation } from '@softistx/riva-rest';
import { restEntities } from '@softistx/riva-rest/entities';
import { api } from './api';

// One policy for the riva's queries and mutations.
export const cache = restEntities({
	Invoice: { is: (o) => 'number' in o, key: (o) => o['id'] as string },
});

export const invoice = query(api, 'get /invoices/{id}', { cache });
export const invoices = query(api, 'get /invoices', { cache });
export const createInvoice = mutation(api, 'post /invoices', { cache });
```

`is` says whether an object of a response is that type (REST has no `__typename`), `key` gives its id. Share the `restEntities()` result itself. [Guide](./docs/guide/cache.md).

## Entry points

- `@softistx/riva-rest`: `query`, `mutation`, `rest` (`{ query, mutation }`), `provideRest`, `httpyzTransport`, `toRivaError`, `operationOf` (reads a route into `{ id, method, path, operationId, hasInput }`) and the types: `RestTransport`, `RestContext`, `Route`, `Operation`, the options (`RestQueryOptions`, `RestMutationOptions`, `FreeQueryOptions`, `FreeMutationOptions`), the routes (`RouteOf`, `QueryRoute`, `MutationRoute`) and `InputOf`, `DataOf`, `SpecOf`, `ClientOf`, `DecodedOf`.
- `@softistx/riva-rest/entities`: `restEntities` and the types `RestEntity`, `RestEntities`.
- `@softistx/riva-rest/server`: `operations(api)` (a `DataSource` for `dataRoute`), the constant `PREFIX` (`'rest:'`, the prefix of every id the route serves: `rest:<operationId>`) and the types `DataSource`, `DataOperation`, `OperationsOf`.
- `@softistx/riva-rest/bff`: `bffTransport(opts)` and the type `BffTransportOptions`.

Size: riva + riva-rest stays under 8 kB gzipped, and riva + `/bff` under 9 kB, httpyz and openapi-httpyz not counted.
