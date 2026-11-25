# Simple API

## What it is for

`createRiva({ graphql: graphql(client) })` gives `riva.graphql.query`, `mutation`, `mutate` and `subscribe`: call a typed document, get a reactive resource, a handle or a stream. The resources come from [`@softistx/riva/resource`](../../../riva/docs/guide/resources.md).

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

- Variables: a plain value, a riva signal or computed, or a function reading signals (tracked).
- `enabled` false: `idle`, the variables function is not called, no fetch. `await` then rejects with a `RIVA_DEFINITION` error.
- `keepPrevious` (default true): new variables keep the old data with `placeholder: true` until the new data lands.
- `signal` stops the wait of `await`, not the shared fetch.

## Partial results

Data with errors is `status: 'error'`, `data` kept, `error` a `GraphQLError` with `errors` (message, path, code):

```ts
const s = books.state;
if (s.status === 'error') s.data; // the partial result, or undefined
```

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

The state is `loading` until the first result, then `success` with the last one. Variables that change restart the stream; deep-equal variables do not reconnect. Each result is merged into the normalized cache when there is one. The last unsubscribe closes the stream.

Problems: [troubleshooting](../troubleshooting.md).
