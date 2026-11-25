# The loader pattern

## What it is for

Define the query once, read it in the loader and in the component. The loader fetches on the server and hands the snapshot to the browser; the component reads the same entry.

## Example

```tsx
// app/patients.tsx
import { query } from '@softistx/riva-graphql';
import { useQuery } from '@softistx/riva-react';
import { riva, rivaOf } from '@softistx/riva-react-router';
import { PATIENTS_QUERY } from './graphql'; // schematic: your document
import type { Route } from './+types/patients';

export const patients = query(PATIENTS_QUERY, { staleTime: '30s' });

export async function loader({ context, params }: Route.LoaderArgs) {
	await patients.ensure(rivaOf(context), { school: params.school });
	return riva(context);
}

export default function Patients({ params }: Route.ComponentProps) {
	const { data } = useQuery(patients, { school: params.school });
	return <ul>{data?.patients.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

## The API

| Export | What |
|---|---|
| `rivaOf(context)` | The request's client; throws `RivaScopeError` when the middleware did not run. |
| `riva(context)` | `{ '~riva': Snapshot }`, to return from the loader (or spread into its data). |
| `rivaContext` | The router context key. |

`ContextLike` is what `rivaOf` and `riva` accept (anything with `context.get`).

## How hydration works

The provider hydrates each match's `~riva` once. The first render is seeded before its children read, so the server markup and the browser's first render agree and fresh data is not fetched again. On a navigation or revalidation, entries something observes (and entries with a cache policy) are applied in a layout effect, never during a render. Named signals that travel (`ssr: true`) are seeded once; a signal the browser already holds, and every local signal, keeps its value.

`Snapshot` keeps its brand through `useLoaderData`, so `data['~riva']` can be handed to `hydrate` by hand.

## Traps

- `rivaOf` and `riva` are for server loaders and actions only; `clientLoader` is not supported.
- Every `riva(context)` call dehydrates the whole request client: return it from one loader per request (usually the root's), and let the others only `ensure` their data.
- Only loaders that return `riva(context)` feed the provider.
- The ambient scope (`mySignal.get()` resolving to the request's client, also after an `await`) works only inside the `next` that `rivaMiddleware` runs: loaders, actions and the code they call. Outside it (an earlier middleware, a module scope), use `rivaOf(context)`.
- Errors travel as codes: a failed query rehydrates as its class (`instanceof RivaRequestError` holds) with an empty message.
- Data that refetches right after hydration: see [troubleshooting](../troubleshooting.md).
