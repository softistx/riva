# Infinite lists: `@softistx/riva-react/infinite`

`useInfiniteQuery` binds a list built with `infinite()` from `@softistx/riva/infinite`. `connection` reads the Relay shape `{ edges: [{ node, cursor }], pageInfo }` out of a page, and `data.nodes` is every loaded page's nodes, flattened.

```tsx
import { infinite } from '@softistx/riva/infinite';
import { useInfiniteQuery } from '@softistx/riva-react/infinite';

const patientsFeed = infinite({
	id: 'patientsFeed',
	// `after` is the cursor the engine fills in; the caller passes `school` only.
	fetch: ({ school, after }: { school: string; after?: string }) => fetchPatientPage(school, after),
	connection: (page) => page.patients, // { edges: [{ node, cursor }], pageInfo }
});

function Feed({ school }: { school: string }) {
	const { data, hasNext, isFetchingNext, fetchNext } = useInfiniteQuery(patientsFeed, { school });
	return (
		<>
			<ul>{data?.nodes.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
			{hasNext && <button disabled={isFetchingNext} onClick={fetchNext}>More</button>}
		</>
	);
}
```

`useInfiniteQuery(def, vars?, opts?)`:

| Option | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | `false` observes nothing and reads `idle`. |

Returns the list's state (`status`, `data` with `nodes` and `pages`, `error`, `isFetching`, `hasNext`, `hasPrevious`, `isFetchingNext`, `isFetchingPrevious`) plus `fetchNext`, `fetchPrevious` and `refetch` (every loaded page).

How a refetch, a page error and `setData` behave: the core's [infinite guide](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/infinite.md).
