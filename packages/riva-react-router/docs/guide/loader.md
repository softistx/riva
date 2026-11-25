# The loader pattern

## What it is for

Await the data in the loader, read it in the component. The loader fetches on the server and hands the snapshot to the browser; the component reads the same entry with a hook.

## Example

`appRivaOf` is the typed accessor of [setup](./setup.md), so `riva.graphql` and `riva.rest` are typed.

```tsx
// app/patients.tsx
import { riva } from '@softistx/riva-react-router';
import { useGraphQL } from '@softistx/riva-graphql/react';
import { PATIENTS_QUERY } from './graphql'; // schematic: your document
import { appRivaOf } from './riva';
import type { Route } from './+types/patients';

export async function loader({ context, params }: Route.LoaderArgs) {
	await appRivaOf(context).graphql.query(PATIENTS_QUERY, { school: params.school });
	return riva(context);
}

export default function Patients({ params }: Route.ComponentProps) {
	const patients = useGraphQL(PATIENTS_QUERY, { school: params.school });
	if (patients.status !== 'success') return null;
	return <ul>{patients.data.patients.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

With REST the loader awaits `appRivaOf(context).rest.get('/patients/{id}', { param: { id: params.id } })` and the component calls `useRest` of `@softistx/riva-rest/react`.

Several reads in one loader run together:

```ts
const app = appRivaOf(context);
await Promise.all([
	app.graphql.query(PATIENTS_QUERY, { school: params.school }),
	app.graphql.query(SCHOOL_QUERY, { school: params.school }),
]);
```

The awaited call fills the request riva; the entry is fresh for `staleTime`, so the hydrating browser reads it instead of fetching again. Set `defaults: { staleTime }` on the riva ([setup](./setup.md)). With a query definition, `await def.ensure(rivaOf(context), vars)` does the same: [shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md).

## The API

| Export | What |
|---|---|
| `rivaOf(context)` | The request's riva; throws `RivaScopeError` when the middleware did not run. |
| `riva(context)` | `{ '~riva': Snapshot }`, to return from the loader (or spread into its data). |
| `rivaContext` | The router context key. |

`ContextLike` is what `rivaOf` and `riva` accept (anything with `context.get`).

## How hydration works

The provider hydrates each match's `~riva` once. The first render is seeded before its children read, so the server markup and the browser's first render agree and fresh data is not fetched again. On a navigation or revalidation, entries something observes (and entries with a cache policy) are applied in a layout effect, never during a render. Named signals that travel (`ssr: true`) are seeded once; a signal the browser already holds, and every local signal, keeps its value.

`Snapshot` keeps its brand through `useLoaderData`, so `data['~riva']` can be handed to `hydrate` by hand.

## Traps

- The instance variable and the `riva(context)` helper share a name. In a loader, do not name the instance `riva` (e.g. `const r = rivaOf(context)`), or import the helper under an alias (`import { riva as rivaData } from '@softistx/riva-react-router'`); otherwise the call fails with "riva is not a function".
- `rivaOf` and `riva` are for server loaders and actions only; `clientLoader` is not supported.
- Every `riva(context)` call dehydrates the whole request riva: return it from one loader per request (usually the root's), and let the others only await their data.
- Only loaders that return `riva(context)` feed the provider.
- The ambient scope (`mySignal.get()` resolving to the request's riva, also after an `await`) works only inside the `next` that `rivaMiddleware` runs: loaders, actions and the code they call. Outside it (an earlier middleware, a module scope), use `rivaOf(context)`.
- The loader and the component use the same kind of entry: a loader that awaits `riva.graphql.query(DOC)` is read by `useGraphQL(DOC)`, not by `useQuery(def)`.
- Errors travel as codes: a failed query rehydrates as its class (`instanceof RivaRequestError` holds) with an empty message.
- Data that refetches right after hydration: see [troubleshooting](../troubleshooting.md).
