# Transport

## What it is for

Definitions are stateless; the transport lives on the `RivaClient` that runs them. Give each client one when you create it.

## Provide it

```ts
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRivaClient } from '@softistx/riva';
import { graphqlClientTransport, provideGraphQL } from '@softistx/riva-graphql';

const gql = createGraphQLClient({ url: 'https://api.example.com/graphql' });

export const client = createRivaClient();
provideGraphQL(client, graphqlClientTransport(gql));
```

On the server, build both inside the request handler so the caller's credentials stay with the request.

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
| `kind` | `'query'` or `'mutation'`. |
| `persistedId` | The preset's hash, when there is one. |
| `id` | The persisted id, else the name. |

A transport that only posts an id and variables to a BFF route fits. Map its failures with `toRivaError(error, signal?)`.

```ts
import { provideGraphQL, toRivaError, type GraphQLTransport } from '@softistx/riva-graphql';

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
provideGraphQL(client, transport);
```

## Traps

- A definition that runs on a client with no transport throws a `RivaScopeError` naming `provideGraphQL`.
- Providing a transport on one client never affects another: it is per client.
