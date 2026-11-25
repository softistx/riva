# After a write

## What it is for

After an action or a mutation, the data on screen must follow. Three tools: write the action's answer into a query, re-run the route loaders, or invalidate on every non-GET settle.

## `useActionResult`

`useActionResult(result, { into, vars, select? })` writes an action's result (`useActionData()`, or a fetcher's `data`) into a query's entry, once per result.

| Option | Default | Meaning |
|---|---|---|
| `into` | required | The query definition whose entry is written. |
| `vars` | required | The variables of that entry. |
| `select(result)` | the result itself | Picks the query's data out of the result (required when the types differ). Returning `undefined` (a validation error) writes nothing. |

## `revalidate`

`revalidate` is a query: invalidating it re-runs the route loaders through the router's `revalidate()`. Put it in a mutation's `invalidates`, or call `revalidate.invalidate(client)`; invalidations of one tick make one run.

## `invalidateOnAction`

`<RivaRouterProvider invalidateOnAction={[patients, revalidate]}>` invalidates that list each time a non-GET navigation or fetcher settles, so a plain `<Form>` keeps the data fresh with no hand-written glue.

## Example

```tsx
// app/patients.tsx
import { mutation } from '@softistx/riva-graphql';
import { useQuery } from '@softistx/riva-react';
import { revalidate, useActionResult } from '@softistx/riva-react-router';
import { useActionData } from 'react-router';
import type { Route } from './+types/patients';
import { patients } from './patients.queries'; // the query of "The loader pattern"
import { RENAME_PATIENT_MUTATION } from './graphql'; // schematic: your document

// A mutation run in the browser re-runs the route loaders too.
export const renamePatient = mutation(RENAME_PATIENT_MUTATION, {
	invalidates: [revalidate],
});

// app/root.tsx: a plain <Form> post settles, then these are invalidated.
// <RivaRouterProvider invalidateOnAction={[patients, revalidate]}>

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
- `useActionResult` writes once per result object: a new action answer is a new write.
- An action that answers a validation error should make `select` return `undefined`, so the entry keeps its last good data.

Fixes: [troubleshooting](../troubleshooting.md).
