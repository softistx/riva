# Cache

> Most call sites use the [simple API](./simple-api.md). This page covers the definition, for settings several call sites share: see [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md).

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
	// The full form: `is` recognises the type, `key` gives its id.
	Invoice: { is: (o) => 'number' in o, key: (o) => o['id'] as string },
	// The shorthand: a key function alone. An object is a Customer when it returns an id.
	Customer: (o) => ('email' in o ? (o['id'] as string) : undefined),
});

export const invoice = query(api, 'get /invoices/{id}', { cache });
export const invoices = query(api, 'get /invoices', { cache });
export const createInvoice = mutation(api, 'post /invoices', { cache });
```

## Options

`restEntities(types, options?)`:

| Argument | Default | Meaning |
|---|---|---|
| `types` | required | `{ Type: { is(obj), key(obj) } }`: `is` says whether an object of a response is that type (REST has no `__typename`), `key` gives its id. A type may also be a key function alone, `{ Type: (obj) => id }`: the object is of the type when the function returns an id (not `undefined` or `null`). |
| `options.identify` | the types' rule | The core's `identify`, to replace the identity rule altogether. |

Recognised objects get a `__typename`; the core's `readEntity('Invoice:7')`, `writeEntity` and `invalidateEntity` work on them.

## Traps

- **Share the `restEntities()` result itself**, not its arguments: two calls throw `RIVA_CACHE` on one riva, even with the same `types`.
- **`is` must tell the types apart**: the first type that matches wins, so `'id' in o` for two resources tags both as the first one. The same holds for the shorthand: with several types, a bare `(o) => o['id']` matches every object with an id, so each key function must discriminate (`(o) => ('invoiceNo' in o ? (o['id'] as string) : undefined)`), or use the full `{ is, key }` form. A key function runs more than once per object (to recognise it, then to key it), so keep it pure.
- **The injected `__typename` shows up in the data.** Send it back to the API (an edit form's value as a request body) and request validation fails on the unknown field: drop it first.
- **REST and GraphQL policies cannot share one riva's store** in v1: a riva holds one set of identity rules.

Fixes: [troubleshooting](../troubleshooting.md).
