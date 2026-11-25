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

`/server` imports `node:async_hooks`: keep it out of the browser bundle (React Router drops a route module's `middleware` export from the client build).

Only loaders that return `riva(context)` feed the provider, the root's or a child's: it hydrates the `~riva` snapshot of each match, once.

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

Inside a request (loader, action, middleware) the ambient scope works after an `await`: `mySignal.get()` resolves to the request's client.

## Exports

| Export | From | What |
| --- | --- | --- |
| `rivaMiddleware(opts?)` | `/server` | Root middleware: creates the client (`create`), awaits `setup`, sets the context, runs the rest of the request in the ambient scope. |
| `rivaOf(context)` | `.` | The request's client; `RivaScopeError` when the middleware did not run. |
| `riva(context)` | `.` | `{ '~riva': Snapshot }`, to spread into loader data. |
| `rivaContext` | `.` | The router context key. |
| `RivaRouterProvider` | `.` | `client?`, `setup?`, `children`. |

## Notes for hosts

- The ambient scope is one `AsyncLocalStorage` per process, wired by importing `/server` (`setScopeResolver` is one per process: another resolver replaces it).
- With `@softistx/alxia-react-router` the same middleware and loaders apply; put `rivaMiddleware` in the root route's `middleware`, beside alxia's own.
- `Snapshot` keeps its brand through `useLoaderData`, so `data['~riva']` can be handed to `hydrate` by hand.
- Errors travel as codes: a failed query rehydrates as its class (`instanceof RivaRequestError` holds) with an empty message.

More: [docs](./docs/README.md), [troubleshooting](./docs/troubleshooting.md), [spec](../../docs/spec.md).
