# Cache

Entry point: `@softistx/riva-rest/entities`.

## What it is for

By default an entry is keyed by request: the route and its input. To share resources between queries, opt in to entities: each object you recognise is stored once, and a refetch or a mutation result updates every query that shows it.

## Use it

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

## Options

`restEntities(types, options?)`:

| Argument | Default | Meaning |
|---|---|---|
| `types` | required | `{ Type: { is(obj), key(obj) } }`: `is` says whether an object of a response is that type (REST has no `__typename`), `key` gives its id. |
| `options.identify` | the types' rule | The core's `identify`, to replace the identity rule altogether. |

Recognised objects get a `__typename`; the core's `readEntity('Invoice:7')`, `writeEntity` and `invalidateEntity` work on them.

## Traps

- **Share the `restEntities()` result itself**, not its arguments: two calls throw `RIVA_CACHE` on one riva, even with the same `types`.
- **`is` must tell the types apart**: the first type that matches wins, so `'id' in o` for two resources tags both as the first one.
- **The injected `__typename` shows up in the data.** Send it back to the API (an edit form's value as a request body) and request validation fails on the unknown field: drop it first.
- **REST and GraphQL policies cannot share one riva's store** in v1: a riva holds one set of identity rules.

Fixes: [troubleshooting](../troubleshooting.md).
