# @softistx/riva-react-router

React Router host for riva: one `Riva` per request, server-side loading with `dehydrate`, browser hydration and a merge of each navigation's data. Built for React Router 8 framework mode (and `@softistx/alxia-react-router`, which hosts the same routes); it never imports alxia.

```sh
bun add @softistx/riva-react-router @softistx/riva @softistx/riva-react react react-router
```

Peers: `@softistx/riva`, `@softistx/riva-react`, `react` ^19 and `react-router` ^8. `@softistx/alxia-react-router` is an optional peer, for hosting the routes with alxia.

## Setup

`middleware` on a route module needs React Router 8 framework mode. Build the riva in one module that both the server and the browser can import, put the middleware on the root route, and give the same factory to the provider:

```ts
// app/riva.ts: one factory, so the request, the render and the browser build the same riva
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva } from '@softistx/riva';
import { withGraphQL } from '@softistx/riva-graphql';

const API_URL = 'https://api.example.com/graphql'; // schematic: your API

export function createAppRiva(cookie?: string) {
	return createRiva({
		graphql: withGraphQL(createGraphQLClient({ url: API_URL, headers: cookie ? { cookie } : {} })),
		defaults: { staleTime: '30s' }, // fresh server data is not fetched again at hydration
	});
}
export type AppRiva = ReturnType<typeof createAppRiva>;

// Register it once: `rivaOf` then carries `riva.graphql` and `riva.rest` in its type.
declare module '@softistx/riva-react-router' {
	interface Register {
		riva: AppRiva;
	}
}
```

```ts
// app/riva.server.ts: a *.server.ts module, so /server stays out of the browser bundle
import { rivaMiddleware } from '@softistx/riva-react-router/server';
import { createAppRiva } from './riva';

export const rivaMw = rivaMiddleware({
	// the request's session cookie goes to the API
	create: ({ request }) => createAppRiva(request.headers.get('cookie') ?? undefined),
});
```

```tsx
// app/root.tsx
import { RivaRouterProvider } from '@softistx/riva-react-router';
import { useState } from 'react';
import { Outlet } from 'react-router';
import { createAppRiva } from './riva';
import { rivaMw } from './riva.server';

export const middleware = [rivaMw];

export default function Root() {
	const [riva] = useState(() => createAppRiva()); // the browser's riva, made once
	return (
		<RivaRouterProvider riva={riva}>
			<Outlet />
		</RivaRouterProvider>
	);
}
```

Keep `/server` out of the browser bundle (it imports `node:async_hooks`): build the middleware in a `*.server.ts` module. Declare it once, on the root route; the provider's `riva` prop must stay the same object. [Guide](./docs/guide/setup.md).

## The loader pattern

Await the data in the loader, read it with a hook in the component:

```tsx
// app/patients.tsx
import { riva, rivaOf } from '@softistx/riva-react-router';
import { useGraphQL } from '@softistx/riva-graphql/react';
import { PATIENTS_QUERY } from './graphql'; // schematic: your document
import type { Route } from './+types/patients';

export async function loader({ context, params }: Route.LoaderArgs) {
	await rivaOf(context).graphql.query(PATIENTS_QUERY, { school: params.school });
	return riva(context);
}

export default function Patients({ params }: Route.ComponentProps) {
	const patients = useGraphQL(PATIENTS_QUERY, { school: params.school });
	if (patients.status !== 'success') return null;
	return <ul>{patients.data.patients.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

For REST it is `await rivaOf(context).rest.get('/patients/{id}', { param: { id: params.id } })` and `useRest` from `@softistx/riva-rest/react`. `rivaOf` and `riva` are for server loaders and actions only; return `riva(context)` from every loader that needs it: each snapshot key is sent once per request, so a later call carries only what is new or changed. [Guide](./docs/guide/loader.md).

## The `/_data` route

`dataRoute` lets the browser run allowlisted operations through your server, with the session of the request. Mount it on a route with an action; the browser's `bffTransport` (`@softistx/riva-graphql/bff`) posts to it.

```ts
// app/routes/_data.ts
import { dataRoute } from '@softistx/riva-react-router/server';
import { allowlist } from '@softistx/riva-graphql/server';
import manifest from '../generated/allowlist.json';

const route = dataRoute({
	sources: [allowlist(manifest)],
});
export const action = route.action;
export const loader = route.loader; // 405
```

For REST, add `operations(api)` from `@softistx/riva-rest/server` to `sources`. Options: `sources`, `origin`, `maxBytes` (262144), `onError`. Refusals carry `RIVA_DATA_*` codes. [Guide](./docs/guide/data-route.md).

## After a write

- `invalidates: [revalidate]` on a mutation, or `<RivaRouterProvider invalidateOnAction={[revalidate]}>`: `revalidate` is a query, and invalidating it re-runs the route loaders, which await the data again. It needs `RivaRouterProvider` above the caller.
- `useActionResult(result, { into, vars, select? })` writes an action's result into a query definition's entry, once per result ([shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md)).

[Guide](./docs/guide/after-a-write.md).

```tsx
// app/patients.tsx
import { useGraphQL, useGraphQLMutation } from '@softistx/riva-graphql/react';
import { revalidate } from '@softistx/riva-react-router';
import { PATIENTS_QUERY, RENAME_PATIENT_MUTATION } from './graphql'; // schematic: your documents

export default function Patients({ params }: { params: { school: string } }) {
	const patients = useGraphQL(PATIENTS_QUERY, { school: params.school });
	const { run: rename } = useGraphQLMutation(RENAME_PATIENT_MUTATION);
	if (patients.status !== 'success') return null;
	return (
		<ul>
			{patients.data.patients.map((p) => (
				// the write settles, then the loader runs again and awaits the list
				<li key={p.id} onClick={() => rename({ id: p.id, name: 'Ana' }, { invalidates: [revalidate] })}>
					{p.name}
				</li>
			))}
		</ul>
	);
}
```

## Exports

| Export | From | What |
| --- | --- | --- |
| `rivaMiddleware(opts?)` | `/server` | Root middleware: creates the riva (`create`), awaits `setup`, sets the context, runs the rest of the request in the ambient scope. |
| `rivaOf(context)` | `.` | The request's riva, typed by `Register`; `RivaScopeError` when the middleware did not run. |
| `riva(context)` | `.` | `{ '~riva': Snapshot }`, to spread into loader data. |
| `rivaContext` | `.` | The router context key. |
| `RivaRouterProvider` | `.` | `riva?`, `setup?`, `invalidateOnAction?`, `children`. |
| `useActionResult` | `.` | Writes an action's result into a query definition's entry. |
| `revalidate` | `.` | Query that re-runs the route loaders when invalidated. |
| `dataRoute(opts)` | `/server` | The `/_data` action and loader. |

Types: `Register` (augment it with `riva: AppRiva` to type `rivaOf`), `RegisteredRiva`, `RivaFrom`, `ContextLike` (what `rivaOf` and `riva` accept, a `context.get`), `RivaRouterProviderProps` from `.`; `RivaMiddlewareOptions`, `MiddlewareArgs`, `DataRouteOptions`, `DataRoute`, `DataSource` and `DataOperation` from `/server`.

`RegisteredRiva` is what `rivaOf` returns (your registered riva, else `Riva`); `RivaFrom<R>` is the helper that reads `R['riva']`, falling back to `Riva`.

## Notes for hosts

- The ambient scope is one `AsyncLocalStorage` per process, wired by importing `/server` (`setScopeResolver` is one per process: another resolver replaces it).
- With `@softistx/alxia-react-router` the same middleware and loaders apply; put `rivaMiddleware` in the root route's `middleware`, beside alxia's own.
- `Snapshot` keeps its brand through `useLoaderData`, so `data['~riva']` can be handed to `hydrate` by hand.
- Errors travel as codes: a failed query rehydrates as its class (`instanceof RivaRequestError` holds) with an empty message.

## Documentation

- [Guides](https://github.com/softistx/riva/blob/develop/packages/riva-react-router/docs/README.md): setup, the loader pattern, the `/_data` route, after a write.
- [Troubleshooting](https://github.com/softistx/riva/blob/develop/packages/riva-react-router/docs/troubleshooting.md): every error and `RIVA_DATA_*` code, with the fix.
- [Roadmap](https://github.com/softistx/riva/blob/develop/docs/roadmap.md) and [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).
