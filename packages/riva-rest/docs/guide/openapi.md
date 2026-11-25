# OpenAPI mode

## What it is for

`query(api, 'method path', options?)` and `mutation(api, 'method path', options?)` build definitions typed from the spec. The route is the one the spec writes (`'get /invoices/{id}'`), checked at compile time and when the definition is created. The variables are the operation's input (`param`, `query`, `json`, …), the data is its 2xx reply, both from the spec.

## Define and run

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

`ensure(client, vars, { signal })`: the signal reaches the request, and an abort is a `RivaAbortError`.

`rest.query` and `rest.mutation` are the same functions, for the `rest.query(api, 'get /invoices/{id}')` spelling.

## Traps

- **The id is the route**; the cache key is the id plus the stable-serialized input, never hand-written.
- **The data is typed as the client returns it**: decoded for `decode: true` (the default), as JSON carries it for `decode: false`.
- **Routes are narrowed by kind**: `query()` takes every route but `put`, `patch` and `delete` (`QueryRoute`); `mutation()` every one but `get`, `head` and `options` (`MutationRoute`). The wrong one is a compile error and a `TypeError` at definition time. A `POST` that only reads (a search) is a query.
- A route the spec lacks, or written wrongly, throws when the definition is created ([troubleshooting](../troubleshooting.md)).
