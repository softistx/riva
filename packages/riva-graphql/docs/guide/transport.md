# Transport

## What it is for

The transport lives on the `Riva` that runs the calls. `withGraphQL(client)` installs it when you create the riva.

## Provide it

```ts
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva } from '@softistx/riva';
import { withGraphQL } from '@softistx/riva-graphql';

const gql = createGraphQLClient({ url: 'https://api.example.com/graphql' });

export const riva = createRiva({ graphql: withGraphQL(gql) });
```

`withGraphQL(client)` takes a `@softistx/graphql-client` client, or any transport (below). On the server, build the riva inside the request handler so the caller's credentials stay with the request.

A riva made without the extension (`createRiva()`) gets its transport with `provideGraphQL(riva, graphqlClientTransport(gql))`: only [definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md) run on it, there is no `riva.graphql`.

## `graphqlClientTransport(gql)`

Sends a query through `gql.query` and a mutation through `gql.mutate`, with the definition's `AbortSignal`. The client's own `persisted` option decides whether the text or the persisted id is sent:

```ts
const gql = createGraphQLClient({
	url: 'https://api.example.com/graphql',
	persisted: { mode: 'documentId' }, // the preset's persistedDocuments hash
});
```

## A transport of your own

Any object with `execute(operation, variables, { signal })` is a transport. The `operation` carries:

| Field | Meaning |
|---|---|
| `document` | The typed document. |
| `name` | The operation's name. |
| `kind` | `'query'`, `'mutation'` or `'subscription'`. |
| `persistedId` | The preset's hash, when there is one. |
| `id` | The persisted id, else the name. |

`subscribe(operation, variables, { signal })` is optional: it returns an `AsyncIterable` of results that ends when the signal aborts, and `riva.graphql.subscribe` throws without it. A transport must not define `mutate`: `withGraphQL()` takes an object that has one for a `@softistx/graphql-client` client. A transport that only posts an id and variables to a BFF route fits. Map its failures with `toRivaError(error, signal?)`.

```ts
import { createRiva } from '@softistx/riva';
import { withGraphQL, toRivaError, type GraphQLTransport } from '@softistx/riva-graphql';

const transport: GraphQLTransport = {
	async execute(operation, variables, { signal }) {
		try {
			const res = await fetch('/_data', {
				method: 'POST',
				signal,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: operation.id, variables }),
			});
			return (await res.json()).data;
		} catch (error) {
			throw toRivaError(error, signal);
		}
	},
};
const riva = createRiva({ graphql: withGraphQL(transport) });
```

## Traps

- A call or definition that runs on a riva with no transport throws a `RivaScopeError` naming `provideGraphQL`: create the riva with `createRiva({ graphql: withGraphQL(client) })`.
- A transport is per riva: giving one to a riva never affects another.
