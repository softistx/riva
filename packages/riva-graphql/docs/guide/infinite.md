# Infinite lists

> Most call sites use the [simple API](./simple-api.md). This page covers the definition, for settings several call sites share: see [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md).

## What it is for

`infinite(document, { connection })` builds a paginated list from a Relay-shaped query: pages are fetched on demand and flattened.

## Define and run

```ts
import { infinite } from '@softistx/riva-graphql/infinite';
import { PATIENTS_QUERY } from './graphql';

export const patientsFeed = infinite(PATIENTS_QUERY, {
	connection: (data) => data.patients, // { edges, pageInfo }
});

await patientsFeed.ensure(riva, { school: 'north' });
await patientsFeed.fetchNext(riva, { school: 'north' });
const { data, hasNext } = riva.get(patientsFeed, { school: 'north' });
data?.nodes; // the flattened nodes, typed from the document
```

## Options

| Option | Default | Meaning |
|---|---|---|
| `connection` | required | Picks `{ edges: [{ node, cursor }], pageInfo }` out of a page's data. |
| `cursor` | `{ after: 'after', before: 'before' }` | Names of the document's cursor variables. |
| `id` | the query's id plus `#infinite` | Override the list id. |
| `staleTime`, `gcTime`, `retry`, `retryDelay`, `refetchOnFocus`, `refetchOnReconnect`, `refetchEvery` | as `query()` | The core's options. |

See the [core guide](../../../riva/docs/guide/infinite.md) for the state (`hasNext`, `fetchPrevious`…).

## Custom cursor variable names

```ts
// a Patients document declaring `$afterCursor`
export const feed = infinite(PATIENTS_BY_CURSOR_QUERY, {
	connection: (data) => data.patients,
	cursor: { after: 'afterCursor' }, // query Patients($afterCursor: String) { … }
});
```

## Traps

- The caller's variables leave the cursors out: never pass `after` yourself.
- `query(PATIENTS_QUERY)` and `infinite(PATIENTS_QUERY, …)` never share a cache entry (the `#infinite` suffix).
- `infinite()` takes core cache policies only, not `normalized()`.
