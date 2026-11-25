# @softistx/riva-react-router

React Router host for riva: one `RivaClient` per request, server-side loading with `dehydrate`, browser hydration and a merge of each navigation's data. Built for React Router 8 framework mode (and `@softistx/alxia-react-router`, which hosts the same routes); it never imports alxia.

```sh
bun add @softistx/riva-react-router @softistx/riva @softistx/riva-react
```

## Setup

`middleware` on a route module needs React Router 8 framework mode. The middleware goes on the root route, the provider in the root component:

```tsx
// app/root.tsx
import { createGraphQLClient } from '@softistx/graphql-client';
import { graphqlClientTransport, provideGraphQL } from '@softistx/riva-graphql';
import { RivaRouterProvider } from '@softistx/riva-react-router';
import { rivaMiddleware } from '@softistx/riva-react-router/server';
import { Outlet } from 'react-router';

const API_URL = 'https://api.example.com/graphql'; // schematic: your API

export const middleware = [
	rivaMiddleware({
		// the caller port of the request: here its session cookie goes to the API
		setup: (client, { request }) =>
			provideGraphQL(
				client,
				graphqlClientTransport(
					createGraphQLClient({
						url: API_URL,
						headers: { cookie: request.headers.get('cookie') ?? '' },
					}),
				),
			),
	}),
];

export default function Root() {
	return (
		<RivaRouterProvider
			// the client the render and the browser use; the data itself comes from the loaders
			setup={(client) =>
				provideGraphQL(
					client,
					graphqlClientTransport(createGraphQLClient({ url: API_URL })),
				)
			}
		>
			<Outlet />
		</RivaRouterProvider>
	);
}
```

`/server` imports `node:async_hooks`, so it must stay out of the browser bundle. The safe pattern is to build the middleware in a `*.server.ts` module (React Router never bundles it for the browser) and import it from the root:

```ts
// app/riva.server.ts
import { rivaMiddleware } from '@softistx/riva-react-router/server';

export const rivaMw = rivaMiddleware({ /* create, setup */ });
```

```tsx
// app/root.tsx
import { rivaMw } from './riva.server';

export const middleware = [rivaMw];
```

Only loaders that return `riva(context)` feed the provider, the root's or a child's: it hydrates the `~riva` snapshot of each match, once. Every `riva(context)` call dehydrates the whole request client, so return it from one loader per request (usually the root's) and not from every route: the other loaders then only `ensure` their data.

The `client` prop of `RivaRouterProvider` must stay the same object for the lifetime of the mount, and `setup` must be idempotent: React StrictMode runs it twice in development.

## The loader pattern

Define the query once, read it in the loader and in the component:

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

`rivaOf` and `riva` are for server loaders and actions only; `clientLoader` is not supported.

The provider hydrates each match's `~riva` once. The first render is seeded before its children read, so the server markup and the browser's first render agree and fresh data is not fetched again. On a navigation or revalidation, entries something observes (and entries with a cache policy) are applied in a layout effect, never during a render. Named signals that travel (`ssr: true`) are seeded once; a signal the browser already holds, and every local signal, keeps its value.

The ambient scope (`mySignal.get()` resolving to the request's client, also after an `await`) works only inside the `next` that `rivaMiddleware` runs, that is in loaders, actions and the code they call. Outside it (another middleware that runs before, a module scope), use `rivaOf(context)`.

## The `/_data` route

`dataRoute` lets the browser run allowlisted operations through your server, with the session of the request. Mount it on a route with an action; the browser's `bffTransport` (`@softistx/riva-graphql/bff`) posts to it.

```ts
// app/routes/_data.ts
import { dataRoute } from '@softistx/riva-react-router/server';
import type { AllowlistManifest } from '@softistx/riva-graphql/codegen';
import { allowlist } from '@softistx/riva-graphql/server';
import manifest from '../generated/allowlist.json';

// A JSON import widens `kind` to string: assert the manifest's type.
const route = dataRoute({
	sources: [allowlist(manifest as AllowlistManifest)],
});
export const action = route.action;
export const loader = route.loader; // 405
```

Options: `sources` (asked in order, the first that knows the id runs it), `origin` (the one allowed origin, default the request's own; set it behind a proxy), `maxBytes` (default 262144), `onError(error, request)` (what a non-`RivaRequestError` threw, or a network or HTTP failure of the API; the browser only sees a generic answer). Refusals are `{ error: { code, message, status } }` with `RIVA_DATA_*` codes (the `DataRouteCode` type), listed in the [`riva-graphql` troubleshooting](https://github.com/softistx/riva/blob/develop/packages/riva-graphql/docs/troubleshooting.md#riva_data_-refusals-from-the-_data-route).

## After a write

- `useActionResult(result, { into, vars, select? })` writes an action's result (`useActionData()`, or a fetcher's `data`) into a query's entry, once per result. `select` picks the data out of the result (required when the types differ); returning `undefined` (a validation error) writes nothing.
- `revalidate` is a query: invalidating it re-runs the route loaders through the router's `revalidate()`. Put it in a mutation's `invalidates`, or call `revalidate.invalidate(client)`; invalidations of one tick make one run. It needs `RivaRouterProvider` above the caller, else it fails with `RIVA_SCOPE`: `revalidate is observed by RivaRouterProvider: render it above the component that invalidates it.`
- `<RivaRouterProvider invalidateOnAction={[patients, revalidate]}>` invalidates that list each time a non-GET navigation or fetcher settles, so a plain `<Form>` keeps the data fresh with no hand-written glue.

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
	// The action's answer fills the entry at once, no refetch needed.
	useActionResult(data, {
		into: patients,
		vars: { school: params.school },
		select: (r) => r.list, // the query's data, out of the answer
	});
	const { data: list } = useQuery(patients, { school: params.school });
	return <ul>{list?.patients.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

## Exports

| Export | From | What |
| --- | --- | --- |
| `rivaMiddleware(opts?)` | `/server` | Root middleware: creates the client (`create`), awaits `setup`, sets the context, runs the rest of the request in the ambient scope. |
| `rivaOf(context)` | `.` | The request's client; `RivaScopeError` when the middleware did not run. |
| `riva(context)` | `.` | `{ '~riva': Snapshot }`, to spread into loader data. |
| `rivaContext` | `.` | The router context key. |
| `RivaRouterProvider` | `.` | `client?`, `setup?`, `invalidateOnAction?`, `children`. |
| `useActionResult` | `.` | Writes an action's result into a query entry. |
| `revalidate` | `.` | Query that re-runs the route loaders when invalidated. |
| `dataRoute(opts)` | `/server` | The `/_data` action and loader. |

Types: `ContextLike` (what `rivaOf` and `riva` accept, a `context.get`), `RivaRouterProviderProps` from `.`; `RivaMiddlewareOptions`, `MiddlewareArgs`, `DataRouteOptions`, `DataRoute`, `DataSource` and `DataOperation` from `/server`.

## Notes for hosts

- The ambient scope is one `AsyncLocalStorage` per process, wired by importing `/server` (`setScopeResolver` is one per process: another resolver replaces it).
- With `@softistx/alxia-react-router` the same middleware and loaders apply; put `rivaMiddleware` in the root route's `middleware`, beside alxia's own.
- `Snapshot` keeps its brand through `useLoaderData`, so `data['~riva']` can be handed to `hydrate` by hand.
- Errors travel as codes: a failed query rehydrates as its class (`instanceof RivaRequestError` holds) with an empty message.

More: [docs](https://github.com/softistx/riva/blob/develop/packages/riva-react-router/docs/README.md), [troubleshooting](https://github.com/softistx/riva/blob/develop/packages/riva-react-router/docs/troubleshooting.md), [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).
