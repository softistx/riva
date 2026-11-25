# Advanced: shared definitions

## What it is for

Most call sites use the simple API: `riva.graphql.query(DOC, vars)`, `riva.rest.get(path, input)` and the hooks over them. A definition (`query()`, `mutation()`, `infinite()`) is the same thing written once at module level, so that several call sites share its settings. This page says when to reach for one, and how definitions and the simple API live on one riva.

## When to prefer a definition

| You need | Simple API | Definition |
| --- | --- | --- |
| One freshness for every call site | a call's `staleTime`, or `defaults: { staleTime }` on the riva | `staleTime` on the definition |
| Polling, refetch on focus or reconnect, `gcTime`, `retry` | not available | options of `query()` |
| An optimistic update, a write into the cache on success | not available | `optimistic` and `updates` of `mutation()` |
| Invalidate or write a query from anywhere | `invalidates: [DOC]` of a mutation | `def.invalidate(riva, vars)`, `def.setData(riva, vars, data)`, `def.prefetch(riva, vars)` |
| A cursor-paginated list | not available | `infinite()` |
| Fill a loader's entry from an action's answer | not available | `useActionResult(result, { into: def, vars })` |
| A query over a function of your own, with no GraphQL or REST adapter | not available | `query({ id, fetch })` |

Everything else (one-shot reads, reactive resources, mutation handles, subscriptions, the entity cache of the adapter) is the simple API; a definition adds nothing there.

## The smallest example

A definition is stateless: it holds no value until a riva reads it. This one carries a freshness and an invalidation shared by every reader.

```ts
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva } from '@softistx/riva';
import { graphql, mutation, query } from '@softistx/riva-graphql';
import { PATIENTS_QUERY, RENAME_PATIENT_MUTATION } from './graphql'; // your typed documents

export const patients = query(PATIENTS_QUERY, { staleTime: '30s' });
export const renamePatient = mutation(RENAME_PATIENT_MUTATION, {
	invalidates: [patients], // observed lists refetch once it succeeded
});

// `graphql(client)` also gives the riva its transport: no `provideGraphQL` needed.
const riva = createRiva({
	graphql: graphql(createGraphQLClient({ url: 'https://api.example.com/graphql' })),
});

await patients.ensure(riva, { school: 'north' }); // fetch if missing or stale, else the cache
const state = riva.get(patients, { school: 'north' }); // state.data is the document's data
await renamePatient.run(riva, { id: '1', name: 'Ana' }); // rejects after the rollback
patients.invalidate(riva, { school: 'north' });
```

For REST the same shape is `query(api, 'get /invoices/{id}', options)` and `mutation(api, 'post /invoices', options)`, from `@softistx/riva-rest` ([OpenAPI mode](https://github.com/softistx/riva/blob/develop/packages/riva-rest/docs/guide/openapi.md)). A query over your own function is the core's:

```ts
import { createRiva, query, RivaHttpError } from '@softistx/riva';

const user = query({
	id: 'user',
	staleTime: '30s', // "250ms" | "30s" | "5m" | "2h", or a number of ms
	fetch: async (vars: { id: string }, { signal }) => {
		const res = await fetch(`/api/users/${vars.id}`, { signal });
		if (!res.ok) throw new RivaHttpError(res.status);
		return (await res.json()) as { id: string; name: string };
	},
});

const riva = createRiva();
await user.ensure(riva, { id: '1' });
riva.get(user, { id: '1' }); // { status, data, error, isFetching, updatedAt }
```

Every option of a query is in [Queries](./queries.md); the optimistic layer and ordering are in [Mutations](./mutations.md).

## Optimistic updates

The simple mutation handle takes `invalidates` and `signal` only. A write that must show its result at once, and roll back on failure, is a definition:

```ts
import { createRiva, mutation, query } from '@softistx/riva';

const todos = query({ id: 'todos', fetch: async () => (await fetch('/api/todos')).json() as Promise<string[]> });

const addTodo = mutation<string, string>({
	id: 'addTodo',
	run: async (title, { signal }) => (await fetch('/api/todos', { method: 'POST', body: title, signal })).text(),
	optimistic: (title, tx) => tx.set(todos, undefined, (prev) => [...(prev ?? []), title]), // shown at once
	updates: (tx, saved) => tx.set(todos, undefined, (prev) => [...(prev ?? []), saved]), // on success
	invalidates: [todos], // marks stale; observed ones refetch
});

await addTodo.run(createRiva(), 'Buy milk'); // rejects, with the layer dropped, on failure
```

Trap: after success the optimistic layer is dropped, so give the mutation `updates`, `invalidates` or `cache`.

## Server rendering in a loader

A loader fills the request riva before the first render. With a definition, `ensure` does it; with the simple API, `await riva.graphql.query(...)` does the same ([loader pattern](https://github.com/softistx/riva/blob/develop/packages/riva-react-router/docs/guide/loader.md)).

```tsx
import { useQuery } from '@softistx/riva-react';
import { riva, rivaOf } from '@softistx/riva-react-router';
import { patients } from './patients.queries'; // the definition above
import type { Route } from './+types/patients';

export async function loader({ context, params }: Route.LoaderArgs) {
	await patients.ensure(rivaOf(context), { school: params.school });
	return riva(context);
}

export default function Patients({ params }: Route.ComponentProps) {
	const { data } = useQuery(patients, { school: params.school });
	return <ul>{data?.patients.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

A fresh entry is not fetched again at hydration, so give the definition a `staleTime`.

## Entities

For GraphQL and REST, the simple API takes the entity policy once for the whole riva: `graphql(client, { cache: normalized() })` and `rest(api, { cache: restEntities(...) })`. A definition takes `cache` per query or mutation, which is the way for a core `query()` and for a riva that mixes policies. Entities written by either are read by both:

```ts
import { createRiva, query } from '@softistx/riva';
import { entities, readEntity, writeEntity } from '@softistx/riva/entities';

const cache = entities({ keys: { Book: (b) => b['isbn'] as string } });
const patient = query({
	id: 'patient',
	cache, // objects with __typename and id are stored once
	fetch: async (vars: { id: string }) => ({ __typename: 'Patient', id: vars.id, name: 'Ana' }),
});

const riva = createRiva();
await patient.ensure(riva, { id: '1' });
writeEntity(riva, 'Patient:1', { name: 'Anna' }); // every query reaching it sees it
readEntity(riva, 'Patient:1');
```

Details: [Entities](./entities.md), and for the adapters [GraphQL cache](https://github.com/softistx/riva/blob/develop/packages/riva-graphql/docs/guide/cache.md) and [REST cache](https://github.com/softistx/riva/blob/develop/packages/riva-rest/docs/guide/cache.md).

## Infinite lists

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

Name the cursor variables with `cursor: { after: 'afterCursor' }` when the document calls them otherwise. [Infinite lists](./infinite.md).

## Definitions in components

`useQuery`, `useMutation` and `useInfiniteQuery` of `@softistx/riva-react` read definitions; `useGraphQL` and `useRest` read the simple API. See the [React guides](https://github.com/softistx/riva/blob/develop/packages/riva-react/docs/README.md).

## One riva, two kinds of entry

A definition and the simple call for the same document are different cache entries: the simple API stores its data under the id `graphql:<operation id>` (REST: `rest:<method> <path>`), a definition under its own `id`. They never overwrite each other, which has two consequences:

- A loader and the component that reads its data use the same kind. A loader that `ensure`s a definition and a component that calls `useGraphQL` for the same document fetch twice.
- A mutation's `invalidates` targets what it names: `[PATIENTS_QUERY]` marks the simple call's entries stale, `[patients]` the definition's only. Name both to refresh both.

Ids must be unique per riva: two definitions with the same `id` are refused on the server with `RIVA_KEY` ([troubleshooting](../troubleshooting.md)).

## Related

- [Queries](./queries.md), [Mutations](./mutations.md), [Entities](./entities.md), [Infinite lists](./infinite.md): every option of a definition.
- [Resources](./resources.md): the simple API's building blocks.
