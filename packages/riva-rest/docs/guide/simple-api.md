# Simple API

## What it is for

`createRiva({ rest: withRest(api) })` gives `riva.rest.get`, `mutation`, `post`, `put`, `patch` and `delete`: call a path with httpyz's `{ param, query, json }` input, get a reactive resource, a handle or the data. The resources come from [`@softistx/riva/resource`](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/resources.md).

## Setup

The other snippets of this page reuse this one.

```ts
import { createHttpClient } from '@softistx/httpyz';
import { createOpenApiClient } from '@softistx/openapi-httpyz';
import { createRiva, signal } from '@softistx/riva';
import { withRest } from '@softistx/riva-rest';
import { operations } from './generated/openapi/operations'; // from `nxgt-openapi generate`

const http = createHttpClient({ baseUrl: 'https://api.example.com' });
const riva = createRiva({ rest: withRest(createOpenApiClient(http, operations)) });
const invoiceId = signal('1');
const signedIn = signal(true);
const render = (state: unknown) => console.log(state);
```

With no spec, `withRest({ baseUrl })` installs the untyped calls over `fetch`:

```ts
import { createRiva } from '@softistx/riva';
import { withRest } from '@softistx/riva-rest';

const plain = createRiva({
	rest: withRest({ baseUrl: 'https://api.example.com', headers: { authorization: 'Bearer …' } }),
});
const todo = await plain.rest.get<{ id: string; done: boolean }>('/todos/{id}', { param: { id: '1' } });
```

## Reads

```ts
const invoice = riva.rest.get(
	'/invoices/{id}',
	() => ({ param: { id: riva.get(invoiceId) } }),
	{ enabled: () => riva.get(signedIn), keepPrevious: true, staleTime: '30s' },
);

invoice.state; // idle | loading | success | error
invoice.subscribe(render); // starts the fetch
const data = await invoice; // one-shot: the data, or throws
```

- The path is the one the spec writes, checked by the compiler: a path the spec has no `get` for does not compile, and throws `RIVA_DEFINITION` when it reaches runtime.
- The input is a plain value, a riva signal or computed, or a function (evaluated at each render in a hook, so it follows props as well as the signals it reads). It is optional when the operation takes none.
- `enabled` false: `idle`, the input function is not called, no fetch. `await` then rejects with a `RIVA_DEFINITION` error.
- `keepPrevious` (default true): a new input keeps the old data with `placeholder: true` until the new data lands.
- `signal` stops the wait of `await`, not the shared fetch.
- Calls with the same path and input share one cache entry and one request.

## Writes

```ts
const save = riva.rest.mutation('post', '/invoices');
save.state; // idle first, then loading, success or error
const created = await save({ json: { number: 'F-1', total: 10 } }, { invalidates: ['/invoices'] });
save.reset();

await riva.rest.delete('/invoices/{id}', { param: { id: '1' } }, { invalidates: ['/invoices'] });
```

`riva.rest.post / put / patch / delete(path, input, opts)` is the one-shot call with no state. `invalidates` is an array, checked before the call runs: a string is the path of a `get` (every input of it, written as the spec writes it: `'/invoices/{id}'`), and a hand-made `query()` definition or `at(query, vars)` targets its own entries.

## Cache and staleTime

`withRest(api, { cache })` and `withRest({ baseUrl, cache })` set how the data of every simple call is stored. Default: as is, a keyed cache with no entities; pass `restEntities(...)` from `@softistx/riva-rest/entities` to share entities between calls. `staleTime` defaults to the riva's `defaults.staleTime` (0 when unset), so data is refetched by the next read once it is older; a per-call `staleTime` overrides it.

## Errors

The transport's errors are riva's: a declared non-2xx reply is a `RivaHttpError`, a failed request a `RivaNetworkError`, a request or reply the spec refuses (or, with `baseUrl`, a 2xx reply that is not JSON) a `RivaRequestError`, an abort a `RivaAbortError`. They are the `error` of the state and what `await` throws; see [Errors](./errors.md).

Definitions made with `query()` and `mutation()` keep working on the same riva, under their own ids; the simple calls use `rest:<method> <path>`.

## In components and loaders

In a component, `useRest` and `useRestMutation` call the same API on the riva of the nearest provider ([React hooks](../../README.md#react-hooks)). In a React Router loader, `await riva.rest.get(path, input)` fills the request's riva, and the component reads it with `useRest('get', path, input)` ([loader pattern](https://github.com/softistx/riva/blob/develop/packages/riva-react-router/docs/guide/loader.md)). Give the riva a `defaults: { staleTime }` so the browser does not fetch again what the server sent.

A loader can also use a definition (`const def = query(api, 'get /invoices/{id}')`): `await def.ensure(riva, input)`, then `riva.rest.get(def, input)` or `useRest(def, input)` read the same cache entry, and `invalidates: [def]` marks it stale. The definition is used as is, with its own id and options.

When a setting must be shared by several call sites (polling, optimistic updates), use a definition: [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md).

Problems: [troubleshooting](../troubleshooting.md).
