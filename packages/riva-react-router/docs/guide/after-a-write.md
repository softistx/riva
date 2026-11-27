# After a write

## What it is for

After an action or a mutation, the data on screen must follow. The simple way: invalidate `revalidate`, and the route loaders run again and await their data. Two more tools: write an action's answer into a query definition, and invalidate on every non-GET settle.

## `revalidate`

`revalidate` is a query: invalidating it re-runs the route loaders through the router's `revalidate()`. Put it in the `invalidates` of a mutation call, or call `revalidate.invalidate(riva)`; invalidations of one tick make one run. Loaders that `await riva.graphql.query(...)` or `riva.rest.get(...)` then refresh the entries they read, and the components follow.

```tsx
import { useGraphQL, useGraphQLMutation } from '@softistx/riva-graphql/react';
import { revalidate } from '@softistx/riva-react-router';
import { PATIENTS_QUERY, RENAME_PATIENT_MUTATION } from './graphql'; // schematic: your documents

export default function Patients({ params }: { params: { school: string } }) {
	const patients = useGraphQL(PATIENTS_QUERY, { school: params.school });
	const { mutate: rename } = useGraphQLMutation(RENAME_PATIENT_MUTATION);
	if (patients.status !== 'success') return null;
	return (
		<ul>
			{patients.data.patients.map((p) => (
				<li key={p.id} onClick={() => rename({ id: p.id, name: 'Ana' }, { invalidates: [revalidate] })}>
					{p.name}
				</li>
			))}
		</ul>
	);
}
```

Outside a component, `riva.graphql.mutate(DOC, vars, { invalidates: [revalidate] })` does the same. To refresh one query without running every loader, name its document instead: `invalidates: [PATIENTS_QUERY]`.

## `invalidateOnAction`

`<RivaRouterProvider invalidateOnAction={[revalidate]}>` invalidates that list each time a non-GET navigation or fetcher settles, so a plain `<Form>` keeps the data fresh with no hand-written glue. The list takes queries (`revalidate`, definitions) and `at(query, vars)`, not documents.

```tsx
// app/root.tsx
<RivaRouterProvider riva={riva} invalidateOnAction={[revalidate]}>
	<Outlet />
</RivaRouterProvider>
```

## `useActionResult`

`useActionResult(result, { into, vars, select? })` writes an action's result (`useActionData()`, or a fetcher's `data`) into a query definition's entry, once per result, so the screen updates with no refetch. `into` is a definition ([shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md)); read the entry with `useQuery`.

| Option | Default | Meaning |
|---|---|---|
| `into` | required | The query definition whose entry is written. |
| `vars` | required | The variables of that entry. |
| `select(result)` | the result itself | Picks the query's data out of the result (required when the types differ). Returning `undefined` (a validation error) writes nothing. |

```tsx
// app/patients.tsx
import { query } from '@softistx/riva-graphql';
import { useQuery } from '@softistx/riva-react';
import { useActionResult } from '@softistx/riva-react-router';
import { useActionData } from 'react-router';
import type { Route } from './+types/patients';
import { PATIENTS_QUERY } from './graphql'; // schematic: your document

export const patients = query(PATIENTS_QUERY, { staleTime: '30s' });

export async function action({ request, context }: Route.ActionArgs) {
	// ...run the write on the server, then answer with the new row
	return { list: { patients: [{ id: '1', name: 'Ada' }] } };
}

export default function Patients({ params }: Route.ComponentProps) {
	const data = useActionData<typeof action>();
	useActionResult(data, {
		into: patients,
		vars: { school: params.school },
		select: (r) => r.list, // the query's data, out of the answer
	});
	const { data: list } = useQuery(patients, { school: params.school });
	return <ul>{list?.patients.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

## Traps

- `revalidate` needs `RivaRouterProvider` above the caller, else it fails with `RIVA_SCOPE`: `revalidate is observed by RivaRouterProvider: render it above the component that invalidates it.`
- `useActionResult` fills a definition's entry, not the one `useGraphQL` reads: pair it with `useQuery`, or use `revalidate` for the simple API.
- `useActionResult` writes once per result object: a new action answer is a new write.
- An action that answers a validation error should make `select` return `undefined`, so the entry keeps its last good data.

Fixes: [troubleshooting](../troubleshooting.md).
