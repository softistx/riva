# Simple API

## What it is for

`createRiva({ graphql: withGraphQL(client) })` gives `riva.graphql.query`, `mutation`, `mutate` and `subscribe`: call a typed document, get a reactive resource, a handle or a stream. The resources come from [`@softistx/riva/resource`](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/resources.md).

## Setup

The other snippets of this page reuse this one.

```ts
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva, signal } from '@softistx/riva';
import { withGraphQL } from '@softistx/riva-graphql';
import {
	BOOKS_QUERY,
	PATIENT_RENAMED_SUBSCRIPTION,
	PATIENTS_QUERY,
	RENAME_PATIENT_MUTATION,
} from './graphql'; // your typed documents

const riva = createRiva({
	graphql: withGraphQL(createGraphQLClient({ url: 'https://api.example.com/graphql' })),
});
const page = signal(1);
const school = signal('north');
const signedIn = signal(true);
const render = (state: unknown) => console.log(state);
```

## Queries

```ts
const books = riva.graphql.query(BOOKS_QUERY, () => ({ page: riva.get(page) }), {
	enabled: () => riva.get(signedIn),
	keepPrevious: true,
	staleTime: '30s',
});

books.state; // idle | loading | success | error
books.subscribe(render); // starts the fetch
const data = await books; // one-shot: the data, or throws
```

- Variables: a plain value, a riva signal or computed, or a function (evaluated at each render in a hook, so it follows props as well as the signals it reads).
- `enabled` false: `idle`, the variables function is not called, no fetch. `await` then rejects with a `RIVA_DEFINITION` error.
- `keepPrevious` (default true): new variables keep the old data with `placeholder: true` until the new data lands.
- `signal` stops the wait of `await`, not the shared fetch.

## Partial results

Data with errors is `status: 'error'`, `data` kept, `error` a `RivaGraphQLError` with `errors` (message, path, code):

```ts
import { RivaGraphQLError } from '@softistx/riva-graphql';

const s = books.state;
if (s.status === 'error' && s.error instanceof RivaGraphQLError) {
	s.data; // the partial result, or undefined
	s.error.errors.map((e) => e.path); // where each error happened
}
```

See [Errors](./errors.md).

## Mutations

```ts
const save = riva.graphql.mutation(RENAME_PATIENT_MUTATION);
save.state; // idle first, then loading, success or error
const out = await save({ id: '1', name: 'Ana' }, { invalidates: [PATIENTS_QUERY] });
save.reset();
```

`riva.graphql.mutate(DOC, vars, opts)` stays for a one-shot call with no state.

## Subscriptions

```ts
const feed = riva.graphql.subscribe(PATIENT_RENAMED_SUBSCRIPTION, () => ({ school: riva.get(school) }), {
	next(d) {},
	error(e) {},
	complete() {},
});
const off = feed.subscribe(render); // opens the stream
```

The state is `loading` until the first result, then `success` with the last one. Variables that change restart the stream; deep-equal variables do not reconnect. Each result is merged into the normalized cache when there is one. The last unsubscribe closes the stream. On a server a subscription stays `loading`: it is never opened.

## In components and loaders

In a component, `useGraphQL`, `useGraphQLMutation` and `useGraphQLSubscription` call the same API on the riva of the nearest provider ([React hooks](../../README.md#react-hooks)). In a React Router loader, `await riva.graphql.query(DOC, vars)` fills the request's riva, and the component reads it with `useGraphQL(DOC, vars)` ([loader pattern](https://github.com/softistx/riva/blob/develop/packages/riva-react-router/docs/guide/loader.md)). Give the riva a `defaults: { staleTime }` so the browser does not fetch again what the server sent.

```ts
import { query } from '@softistx/riva-graphql';

const patients = query(PATIENTS_QUERY);
await patients.ensure(riva, { school }); // in the loader
await riva.graphql.mutate(RENAME_MUTATION, vars, { invalidates: [patients] });
```

A loader can also use a definition (`const def = query(DOC)`): `await def.ensure(riva, vars)`, then `riva.graphql.query(def, vars)` or `useGraphQL(def, vars)` read the same cache entry, and `invalidates: [def]` marks it stale. The definition is used as is, with its own id and options.

When a setting must be shared by several call sites (polling, optimistic updates, infinite lists), use a definition: [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md).

Problems: [troubleshooting](../troubleshooting.md).
