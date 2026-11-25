# Queries

## What it is for

`query(document, options?)` turns a typed document into a riva query definition: the variables and the data are inferred.

## Define and run

```ts
import { query } from '@softistx/riva-graphql';
import { PATIENTS_QUERY } from './graphql';

export const patients = query(PATIENTS_QUERY, { staleTime: '30s' });

await patients.ensure(client, { school: 'north' }); // variables typed from the document
const state = client.get(patients, { school: 'north' }); // state.data is the document's data
patients.invalidate(client, { school: 'north' });
```

A document with no variables takes none: `viewer.ensure(client)`.

## Options

`GraphQLQueryOptions` is the core's query options minus `fetch`, plus `id` and `cache`.

| Option | Default | Meaning |
|---|---|---|
| `id` | the persisted id, else the operation name | Override to define one document twice with different options. |
| `staleTime` | core default | How long data is fresh. |
| `gcTime` | core default | How long unobserved data stays. |
| `retry` | 3 in a browser, 0 on the server | A count, or `(failures, error) => boolean`. |
| `retryDelay` | `min(1000 * 2 ** failures, 30000)` | `(failures) => ms`. |
| `refetchOnFocus`, `refetchOnReconnect` | core default | Refetch when the window refocuses or the network returns. |
| `refetchEvery` | none | Polling interval. |
| `cache` | none | A core policy or an `OperationCache` such as `normalized()` ([cache](./cache.md)). |

Each one is documented in the [core guide](../../../riva/docs/guide/queries.md).

## Traps

- **Ids must be unique.** Two definitions with the same `id` (an override reused by mistake, or two documents sharing an operation name) collide on one cache entry.
- A document that is not one named query is refused with a `TypeError` when the definition is created.
