# @softistx/riva-react-router

React Router host for riva: one `RivaClient` per request, server-side loading with `dehydrate`, browser hydration and a merge of each navigation's data. Built for React Router 8 framework mode (and `@softistx/alxia-react-router`, which hosts the same routes); it never imports alxia.

```sh
bun add @softistx/riva-react-router @softistx/riva @softistx/riva-react react react-router
```

Peers: `@softistx/riva`, `@softistx/riva-react`, `react` ^19 and `react-router` ^8. `@softistx/alxia-react-router` is an optional peer, for hosting the routes with alxia.

## Setup

`middleware` on a route module needs React Router 8 framework mode. The middleware goes on the root route, the provider in the root component:

```ts
// app/riva.server.ts: built in a *.server.ts module, so /server stays out of the browser bundle
import { createGraphQLClient } from '@softistx/graphql-client';
import { graphqlClientTransport, provideGraphQL } from '@softistx/riva-graphql';
import { rivaMiddleware } from '@softistx/riva-react-router/server';

const API_URL = 'https://api.example.com/graphql'; // schematic: your API

export const rivaMw = rivaMiddleware({
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
});
```

```tsx
// app/root.tsx
import { createGraphQLClient } from '@softistx/graphql-client';
import { graphqlClientTransport, provideGraphQL } from '@softistx/riva-graphql';
import { RivaRouterProvider } from '@softistx/riva-react-router';
import { Outlet } from 'react-router';
import { rivaMw } from './riva.server';

const API_URL = 'https://api.example.com/graphql'; // schematic: your API

export const middleware = [rivaMw];

export default function Root() {
	return (
		<RivaRouterProvider
			// the client the render and the browser use; the data itself comes from the loaders
			setup={(client) =>
				provideGraphQL(client, graphqlClientTransport(createGraphQLClient({ url: API_URL })))
			}
		>
			<Outlet />
		</RivaRouterProvider>
	);
}
```

Keep `/server` out of the browser bundle (it imports `node:async_hooks`): build the middleware in a `*.server.ts` module. Declare it once, on the root route; the provider's `client` prop must stay the same object. [Guide](./docs/guide/setup.md).

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

`rivaOf` and `riva` are for server loaders and actions only; return `riva(context)` from one loader per request. [Guide](./docs/guide/loader.md).

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

For REST, add `operations(api)` from `@softistx/riva-rest/server` to `sources`. Options: `sources`, `origin`, `maxBytes` (262144), `onError`. Refusals carry `RIVA_DATA_*` codes. [Guide](./docs/guide/data-route.md).

## After a write

- `useActionResult(result, { into, vars, select? })` writes an action's result into a query's entry, once per result.
- `revalidate` is a query: invalidating it re-runs the route loaders. It needs `RivaRouterProvider` above the caller.
- `<RivaRouterProvider invalidateOnAction={[patients, revalidate]}>` invalidates that list each time a non-GET navigation or fetcher settles.

[Guide](./docs/guide/after-a-write.md).

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

More: [guides](https://github.com/softistx/riva/blob/develop/packages/riva-react-router/docs/README.md), [troubleshooting](https://github.com/softistx/riva/blob/develop/packages/riva-react-router/docs/troubleshooting.md), [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).
