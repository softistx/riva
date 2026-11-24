# @softistx/riva-rest

REST for [riva](https://github.com/softistx/riva/blob/develop/packages/riva/README.md): `query` and `mutation` definitions typed from an OpenAPI spec through [`@softistx/openapi-httpyz`](https://github.com/softistx/nxgt-http/tree/develop/packages/openapi-httpyz) (path parameters, query, body and reply, never annotated), a free-fetcher mode for APIs with no schema, a per-client transport over [`@softistx/httpyz`](https://github.com/softistx/nxgt-http/tree/develop/packages/httpyz), and httpyz's errors mapped to riva's.

Errors and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).

```sh
bun add @softistx/riva @softistx/riva-rest @softistx/httpyz @softistx/openapi-httpyz
```

Peers: `@softistx/riva` and `@softistx/httpyz`. `@softistx/openapi-httpyz` is optional: only the OpenAPI mode needs it. The runtime entries import none of them.

## Provide the transport

Definitions are stateless; the transport lives on the `RivaClient` that runs them. Give each client one when you create it (on the server, one per request).

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
- **The data is typed as the default client decodes it** (`decode: true`). For a client made with `decode: false` annotate the data yourself with the free-fetcher mode.
- A query may be a `POST` that only reads (a search); a mutation is never a `GET`, `HEAD` or `OPTIONS`, a query never a `PUT`, `PATCH` or `DELETE`.
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

`toRivaError(error, signal?)` is exported for your own transports. See [troubleshooting](./docs/troubleshooting.md).

## Cache

By default an entry is keyed by request: the route and its input. To share resources between queries, opt in to entities from `@softistx/riva-rest/entities`: each object you recognise is stored once, and a refetch or a mutation result updates every query that shows it.

```ts
import { restEntities } from '@softistx/riva-rest/entities';

// One policy for the client's queries and mutations.
export const cache = restEntities({
	Invoice: { is: (o) => 'number' in o, key: (o) => o['id'] as string },
});

export const invoice = query(api, 'get /invoices/{id}', { cache });
export const invoices = query(api, 'get /invoices', { cache });
export const createInvoice = mutation(api, 'post /invoices', { cache });
```

`is` says whether an object of a response is that type (REST has no `__typename`), `key` gives its id. Recognised objects get a `__typename`, so data readers see carries it; the core's `readEntity('Invoice:7')`, `writeEntity` and `invalidateEntity` work on them. Share one `restEntities()` between a client's definitions: two policies with different keys on one client are refused with `RIVA_CACHE`.

## Entry points

- `@softistx/riva-rest`: `query`, `mutation`, `provideRest`, `httpyzTransport`, `toRivaError`, `operationOf` and the types (`RestTransport`, `RestContext`, `InputOf`, `DataOf`).
- `@softistx/riva-rest/entities`: `restEntities`.

Size: riva + riva-rest stays under 8 kB gzipped, httpyz and openapi-httpyz not counted.
