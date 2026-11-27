# OpenAPI mode

> Most call sites use the [simple API](./simple-api.md). This page covers the definition, for settings several call sites share: see [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md).

## What it is for

`query(operations, 'method path', options?)` and `mutation(operations, 'method path', options?)` build definitions typed from the spec, from the generated `operations` table alone. The data is typed as the decoded reply, what a client with the default `decode: true` returns; for a client built with `decode: false`, `query(api, …)` and `mutation(api, …)` take the client instead and type the JSON reply. The route is the one the spec writes (`'get /invoices/{id}'`), checked at compile time and when the definition is created. The variables are the operation's input (`param`, `query`, `json`, …), the data is its 2xx reply, both from the spec.

## Define and run

Recommended for a definition module: pass the generated `operations` table, so the module imports no client. The client comes from the riva's transport at run time (`provideRest(riva, httpyzTransport(http, api))`), which looks the operation up in its own client.

```ts
import { mutation, query } from '@softistx/riva-rest';
import { operations } from './generated/invoices';

export const invoice = query(operations, 'get /invoices/{id}', { staleTime: '30s' });
export const invoices = query(operations, 'get /invoices');
export const createInvoice = mutation(operations, 'post /invoices', { invalidates: [invoices] });

await invoice.ensure(riva, { param: { id: '7' } }); // Invoice
```

The client form (for `decode: false`):

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

## Options

| Option | Default | Meaning |
|---|---|---|
| `id` | the route (`get /invoices/{id}`) | Override to define one route twice with different options. |
| `staleTime`, `gcTime` | core defaults | Freshness and retention. |
| `retry` | 3 in a browser, 0 on the server | A count, or `(failures, error) => boolean`. |
| `retryDelay` | `min(1000 * 2 ** failures, 30000)` | `(failures) => ms`. |
| `refetchOnFocus`, `refetchOnReconnect`, `refetchEvery` | core defaults | Query refetch triggers. |
| `cache` | none | A core policy, such as `restEntities()` ([cache](./cache.md)). |
| `optimistic`, `updates`, `invalidates` | none | Mutation options, as the [core](../../../riva/docs/guide/mutations.md). |

## Cancel

`ensure(riva, vars, { signal })`: the signal reaches the request, and an abort is a `RivaAbortError`.

## Traps

- **The id is the route**; the cache key is the id plus the stable-serialized input, never hand-written.
- **The data is typed as the client returns it**: decoded for `decode: true` (the default), as JSON carries it for `decode: false`. The table form has no client to read it from and always types the decoded reply; use the client form for a `decode: false` client.
- **The transport must be built over the same spec**: the table form names the operation, and the transport's client runs it ([troubleshooting](../troubleshooting.md)).
- **Routes are narrowed by kind**: `query()` takes every route but `put`, `patch` and `delete` (`QueryRoute`); `mutation()` every one but `get`, `head` and `options` (`MutationRoute`). The wrong one is a compile error and a `RivaError` (`RIVA_DEFINITION`) at definition time. A `POST` that only reads (a search) is a query.
- A route the spec lacks, or written wrongly, throws when the definition is created ([troubleshooting](../troubleshooting.md)).
