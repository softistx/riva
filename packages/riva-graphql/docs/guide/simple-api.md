# Simple API

## What it is for

`createRiva({ graphql: graphql(client) })` gives `riva.graphql.query`, `mutation`, `mutate` and `subscribe`: call a typed document, get a reactive resource, a handle or a stream. The resources come from [`@softistx/riva/resource`](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/resources.md).

## Setup

The other snippets of this page reuse this one.

```ts
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva, signal } from '@softistx/riva';
import { graphql } from '@softistx/riva-graphql';
import {
	BOOKS_QUERY,
	PATIENT_RENAMED,
	PATIENTS_QUERY,
	RENAME_PATIENT,
} from './graphql'; // your typed documents

const riva = createRiva({
	graphql: graphql(createGraphQLClient({ url: 'https://api.example.com/graphql' })),
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

Data with errors is `status: 'error'`, `data` kept, `error` a `GraphQLError` with `errors` (message, path, code):

```ts
import { GraphQLError } from '@softistx/riva-graphql';

const s = books.state;
if (s.status === 'error' && s.error instanceof GraphQLError) {
	s.data; // the partial result, or undefined
	s.error.errors.map((e) => e.path); // where each error happened
}
```

See [Errors](./errors.md).

## Mutations

```ts
const save = riva.graphql.mutation(RENAME_PATIENT);
save.state; // idle first, then loading, success or error
const out = await save({ id: '1', name: 'Ana' }, { invalidates: [PATIENTS_QUERY] });
save.reset();
```

`riva.graphql.mutate(DOC, vars, opts)` stays for a one-shot call with no state.

## Subscriptions

```ts
const feed = riva.graphql.subscribe(PATIENT_RENAMED, () => ({ school: riva.get(school) }), {
	next(d) {},
	error(e) {},
	complete() {},
});
const off = feed.subscribe(render); // opens the stream
```

The state is `loading` until the first result, then `success` with the last one. Variables that change restart the stream; deep-equal variables do not reconnect. Each result is merged into the normalized cache when there is one. The last unsubscribe closes the stream. On a server a subscription stays `loading`: it is never opened.

Problems: [troubleshooting](../troubleshooting.md).
