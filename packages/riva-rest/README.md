# @softistx/riva-rest

REST for [riva](https://github.com/softistx/riva/blob/develop/packages/riva/README.md): `createRiva({ rest: rest(api) })` gives `riva.rest.get`, `mutation`, `post`, `put`, `patch` and `delete`, typed from an OpenAPI spec through [`@softistx/openapi-httpyz`](https://github.com/softistx/nxgt-http/tree/develop/packages/openapi-httpyz) (path parameters, query, body and reply, never annotated) and returning reactive, awaitable resources, with React hooks over them. `rest({ baseUrl })` serves an API with no schema, and httpyz's errors are mapped to riva's. `query()` and `mutation()` definitions stay for settings several call sites share.

Guides and fixes: [docs](./docs/README.md). Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).

```sh
bun add @softistx/riva @softistx/riva-rest @softistx/httpyz @softistx/openapi-httpyz zod
bun add -d @softistx/openapi-codegen typescript
bun add react @softistx/riva-react # only for the hooks
```

Peers: `@softistx/riva` and `@softistx/httpyz`. `@softistx/openapi-httpyz` is optional: only the OpenAPI mode needs it. `@softistx/openapi-codegen` writes the operations table at build time, and that generated `operations.ts` imports `zod`. `react` and `@softistx/riva-react` are optional too: only `/react` needs them. The runtime entries import none of them.

## Generate the operations

The OpenAPI mode reads the operations the spec describes, which `@softistx/openapi-codegen` generates:

```sh
bunx nxgt-openapi generate -i openapi.yaml   # writes generated/openapi
```

The `nxgt-openapi` bin comes from `@softistx/openapi-codegen` (the dev dependency installed above).

[Transport guide](./docs/guide/transport.md).

## Simple API

Install the extension once, then call REST like a function: no definition, no key, no glue. Calls with the same path and input share one cache entry and one in-flight request; errors are riva's.

```ts
import { createHttpClient } from '@softistx/httpyz';
import { createOpenApiClient } from '@softistx/openapi-httpyz';
import { createRiva, signal } from '@softistx/riva';
import { rest } from '@softistx/riva-rest';
import { operations } from './generated/openapi/operations'; // from `nxgt-openapi generate`

const http = createHttpClient({ baseUrl: 'https://api.example.com' });
const riva = createRiva({
	rest: rest(createOpenApiClient(http, operations)),
	defaults: { staleTime: '30s' }, // for every query that sets none
});

const invoice = await riva.rest.get('/invoices/{id}', { param: { id: '1' } }); // one-shot: data or throws

// The same call is a reactive resource: state, subscribe, tracked input.
const id = signal('1');
const signedIn = signal(true);
const live = riva.rest.get('/invoices/{id}', () => ({ param: { id: riva.get(id) } }), {
	enabled: () => riva.get(signedIn), // false: status 'idle', nothing fetched
	keepPrevious: true, // a new input: the old data stays, `placeholder: true`
	staleTime: '30s',
});
live.state; // { status: 'idle' | 'loading' | 'success' | 'error', data, error, isFetching, placeholder }
const off = live.subscribe((state) => console.log(state.status)); // the first reader starts the fetch

const save = riva.rest.mutation('post', '/invoices'); // a handle: state (idle first), reset()
await save({ json: { number: 'F-1', total: 10 } }, { invalidates: ['/invoices'] });
await riva.rest.delete('/invoices/{id}', { param: { id: '1' } }); // one-shot, no handle
```

With no spec, `rest({ baseUrl, fetch?, headers? })` gives the untyped calls over `fetch`: `riva.rest.get<Invoice>('/invoices/42')`.

- The input is httpyz's `{ param, query, json }`, typed by the operations table and optional when the operation takes none. It is a plain value, a riva signal or computed, or a function that reads signals (tracked: when what it reads changes, the key is derived again).
- `get` returns a `Resource` (`@softistx/riva/resource`): `state`, `subscribe` and awaitable. Options: `staleTime` (this call only), `enabled` (a boolean or tracked function; while false the input function is not called), `keepPrevious` (default true) and `signal` (stops the wait of `await`). It is lazy: it fetches from its first subscriber or observed reader, never on a server, where `await` is the way to load.
- `mutation(method, path)` makes a new handle at each call (`post`, `put`, `patch`, `delete`); `post / put / patch / delete(path, input, opts)` run once. Both take `invalidates` (paths of a `get`, hand-made definitions or `at(query, vars)`, marked stale once it succeeded) and `signal`; it is an array, checked before the call runs.
- `cache` (`RestSimpleOptions`, also read from `rest({ baseUrl, cache })`): how the data of every simple call is stored. Default: as is, a keyed cache (no entities). Pass `restEntities(...)` from `@softistx/riva-rest/entities` to share entities. `staleTime` defaults to the riva's `defaults.staleTime` (0 when unset): data older than it is refetched by the next read; a per-call `staleTime` overrides it.
- The definitions behind the calls are made once per riva, per method and path, under the id `rest:<method> <path>`: a hand-made `query(api, route)` on the same riva keeps its own entries. [Guide](./docs/guide/simple-api.md).
- Server rendering: `await riva.rest.get(...)` in a loader fills the request's riva, and `useRest` reads it in the component ([React Router loaders](https://github.com/softistx/riva/blob/develop/packages/riva-react-router/docs/guide/loader.md)). Give the riva `defaults: { staleTime }` so the browser does not fetch it again.

## React hooks

`@softistx/riva-rest/react` calls `riva.rest` from components (`react` and `@softistx/riva-react` are optional peers). A hook has no riva to infer the operations table from, so declare it once:

```ts
import type { operations } from './generated/openapi/operations';

declare module '@softistx/riva-rest/react' {
	interface Register {
		operations: typeof operations;
		// decoded: false; // only for a client made with `decode: false` (data is then the raw reply)
	}
}
```

```tsx
import { useRest, useRestMutation } from '@softistx/riva-rest/react';

function Book({ id }: { id: string }) {
	const book = useRest('get', '/books/{id}', { param: { id } });
	const save = useRestMutation('put', '/books/{id}');
	if (book.status !== 'success') return null;
	return <button onClick={() => save({ param: { id }, json: { title: 'Dune' } })}>{book.data.title}</button>;
}
// useRest('get', path, input, { suspense: true }) suspends and returns the success state.
```

Without `Register` the hooks are untyped (`useRest<T>`). How they behave:

- They return the resource state (`idle | loading | success | error`). A server render seeds and dehydrates, and hydration does not refetch fresh data.
- The input is a plain value, a riva signal or computed, or a function. A function is evaluated at each render, so it follows props (`() => ({ param: { id: props.id } })`) as well as the signals it reads. Equal inputs are one key. A signal or computed is keyed by identity: define it once (module level or `useMemo`), never inline in render.
- A new key refetches and keeps the previous data as `placeholder` (`keepPrevious`, default true).
- While `enabled` is false the status is `idle`, the input function is not called and nothing is fetched.
- `suspense: true` suspends until data, types the state as `success` and sends any error to the nearest error boundary. `enabled` cannot be combined with `suspense` (a type error): a suspending hook is never idle. Its fetch uses a `staleTime` of at least 1000 ms (yours, else the riva's default, whichever is longer).

The mutation hooks return a callable with the state fields and `reset`. The callable (and `reset`) change identity with the state, so call them from handlers and never list them in an effect's dependencies; to react to a result, read `status` and `data`:

```tsx
const add = useRestMutation('post', '/books');
// Handler: fine.
<button onClick={() => add({ json: { title: 'Dune' } })}>Add</button>;
// Effect: depend on the state, not on `add`.
useEffect(() => {
	if (add.status === 'success') close();
}, [add.status]);
```

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

## Shared definitions

A definition is a query or a mutation written once at module level, for what the simple API cannot say: polling, optimistic updates, one `staleTime` shared by several readers, a function of your own for an API with no schema. They run on the same riva as the simple calls, under their own cache entries.

```ts
import { mutation, query } from '@softistx/riva-rest';
import { api } from './api'; // the OpenAPI client given to `rest(api)`

export const invoice = query(api, 'get /invoices/{id}', { staleTime: '30s' });
export const invoices = query(api, 'get /invoices');
export const createInvoice = mutation(api, 'post /invoices', { invalidates: [invoices] });

await invoice.ensure(riva, { param: { id: '7' } }); // Invoice, typed from the spec
await createInvoice.run(riva, { json: { number: 'F-8', total: 120 } });
riva.get(invoices); // an operation whose input is all optional takes no variables
```

`query(api, 'method path', options?)` takes a route the spec writes (`'get /invoices/{id}'`), checked at compile time; every core option works (`staleTime`, `gcTime`, `retry`, `refetchEvery`, `cache`, and for a mutation `optimistic`, `updates`, `invalidates`). For an API with no schema, `query({ id, fetch })` takes a function that gets an `http` client. When to prefer a definition: [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md). Every option: [OpenAPI mode](./docs/guide/openapi.md), [free fetcher](./docs/guide/free-fetcher.md) and the entity [cache](./docs/guide/cache.md) (`@softistx/riva-rest/entities`'s `restEntities`).

## BFF mode

Run the REST calls on the server and keep the browser away from the API: the browser posts `{ id, variables }` to a `dataRoute` (`@softistx/riva-react-router`'s `/_data`), the server runs the operation through the request riva's transport (with its session and base URL) and sends the data back.

Server: `rivaMiddleware({ setup })` gives each request riva its transport, and `dataRoute({ sources: [operations(api)] })` serves the spec's operations. Browser: definitions with `provideRest(riva, bffTransport())` in the router provider's `setup` (the simple `riva.rest` calls the API directly). Ids are `rest:<operationId>`; free fetchers are server-only. [Guide](./docs/guide/bff.md).

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

## Entry points

- `@softistx/riva-rest`: `query`, `mutation`, `rest` (the extension; also `{ query, mutation }`), `provideRest`, `httpyzTransport`, `toRivaError`, `operationOf` (reads a route into `{ id, method, path, operationId, hasInput }`) and the types: `RestTransport`, `RestContext`, `Route`, `Operation`, the simple API (`RestApi`, `UntypedRestApi`, `GetCall`, `MutateCall`, `RestSimpleOptions`, `RestBaseOptions`, `PathsOf`, `MutationMethod`, `InputArg`, `RestInput`), the options (`RestQueryOptions`, `RestMutationOptions`, `FreeQueryOptions`, `FreeMutationOptions`), the routes (`RouteOf`, `QueryRoute`, `MutationRoute`) and `InputOf`, `DataOf`, `SpecOf`, `ClientOf`, `DecodedOf`.
- `@softistx/riva-rest/react`: `useRest`, `useRestMutation` and the types `Register`, `UseRest`, `UseRestMutation`, `UseRestOptions` (optional peers `react` and `@softistx/riva-react`).
- `@softistx/riva-rest/entities`: `restEntities` and the types `RestEntity`, `RestEntities`.
- `@softistx/riva-rest/server`: `operations(api)` (a `DataSource` for `dataRoute`), the constant `PREFIX` (`'rest:'`, the prefix of every id the route serves: `rest:<operationId>`) and the types `DataSource`, `DataOperation`, `OperationsOf`.
- `@softistx/riva-rest/bff`: `bffTransport(opts)` and the type `BffTransportOptions`.

Size: riva + riva-rest stays under 8 kB gzipped, and riva + `/bff` under 9 kB, httpyz and openapi-httpyz not counted.

## Documentation

- [Guides](https://github.com/softistx/riva/blob/develop/packages/riva-rest/docs/README.md): the simple API, transport, BFF, OpenAPI mode.
- [Troubleshooting](https://github.com/softistx/riva/blob/develop/packages/riva-rest/docs/troubleshooting.md): every error and its fix.
- [Roadmap](https://github.com/softistx/riva/blob/develop/docs/roadmap.md) and [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).
