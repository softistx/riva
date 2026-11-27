# `@defer` and `@stream`

## What it is for

A query that selects `@defer` or `@stream` renders progressively. The fast fields show first, and each later part updates `data`. The component has no loop and no `for await`: it reads the query state as for any other query.

## Example

```tsx
import { useGraphQL } from '@softistx/riva-graphql/react';
import { PROFILE_QUERY } from './graphql';

// query Profile { me { __typename id name ... @defer { posts { __typename id title } } } }
export function Profile() {
	const profile = useGraphQL(PROFILE_QUERY);
	if (profile.status !== 'success') return <p>Loading</p>;
	const { me } = profile.data; // there from the first part
	return (
		<>
			<h1>{me.name}</h1>
			{profile.isFetching ? (
				<p>Loading posts</p>
			) : (
				<ul>{me.posts.map((post) => <li key={post.id}>{post.title}</li>)}</ul>
			)}
		</>
	);
}
```

With a query definition and `useQuery` from `@softistx/riva-react`, the state also carries `dataState`:

```tsx
import { query } from '@softistx/riva-graphql';
import { useQuery } from '@softistx/riva-react';
import { PROFILE_QUERY } from './graphql';

const profile = query(PROFILE_QUERY);

export function Profile() {
	const q = useQuery(profile);
	if (q.status !== 'success') return <p>Loading</p>;
	return (
		<>
			<h1>{q.data.me.name}</h1>
			{q.dataState === 'streaming' ? (
				<p>Loading posts</p>
			) : (
				<ul>{q.data.me.posts.map((post) => <li key={post.id}>{post.title}</li>)}</ul>
			)}
		</>
	);
}
```

A resource (`useGraphQL`, `riva.graphql.query(PROFILE_QUERY).state`) shows the stream as `success` with `isFetching: true` and has no `dataState`.

## The state while parts arrive

| | First part | Later parts | Last part |
|---|---|---|---|
| `status` | `success` | `success` | `success` |
| `data` | what arrived so far | the merged result so far | the final result |
| `isFetching` | `true` | `true` | `false` |
| `dataState` (`useQuery`) | `'streaming'` | `'streaming'` | `'complete'` |

Until the first part the query is `loading`, as any query. `success` with `isFetching: true` is riva's "data there, a fetch still running", so a component that renders on `status === 'success'` renders at once. A query with no `@defer` or `@stream` never has a `dataState`.

`dataState` stays `'complete'` after a failed stream too: it means "the stream ended", and `status: 'error'` marks the failure. `'complete'` with `status: 'error'` means `data` is partial, the parts that arrived before the failure.

`data` is typed as the full document's data. A deferred field, or the items a `@stream` has not delivered yet, can be missing while `dataState` is `'streaming'`: read it defensively, or branch on `isFetching` (`dataState` in `useQuery`).

A failure that cuts the stream leaves the parts that arrived in `data`, with `status: 'error'` and `dataState: 'complete'`.

## Suspense

With `suspense: true` (`useQuery`) or `useGraphQL(DOC, vars, { suspense: true })`, the component suspends until the first part, then renders. Later parts update it without suspending again. On the server it waits for the whole result, so what it renders and dehydrates is complete.

## With `normalized()`

Each part is merged into the entity cache as it arrives, so other queries showing the same entities update too. A field that only a `@defer` fragment selects is left out of `data` until its part arrives; a field missing outside a `@defer` fragment is still a miss.

## Abort and refetch

The entry's abort signal closes the request: an unmounted query, `cancel` and a caller's abort end the stream. A refetch (`refetch()`, an invalidation, a variables change) aborts the running stream and starts a new one; parts of the old stream are dropped.

## Which transport

`graphqlClientTransport(client)` (so `withGraphQL(client)`) iterates the client's `client.query(...)` for an operation that selects `@defer` or `@stream` (not switched off by a literal `if: false`), and passes each state before the last to the query. Every other operation keeps the plain path: one request, one result. A server that answers plain JSON anyway is read as a single result.

A transport of your own opts in by calling `onPart(data)` for each part before the last, from `execute(operation, variables, { signal, onPart })`, and resolving with the final data. A transport that ignores `onPart` still works: the query then renders when `execute` resolves.

## Traps

- Reading a deferred field without a guard throws while the query is still fetching.
- The query's `data` is the whole merged result so far, never a patch: replace what you render, do not append.
