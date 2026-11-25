# @softistx/riva-react-router

React Router host for riva: one `RivaClient` per request, server-side loading with `dehydrate`, browser hydration and a merge of each navigation's data. Built for React Router 8 framework mode (and `@softistx/alxia-react-router`, which hosts the same routes); it never imports alxia.

```sh
bun add @softistx/riva-react-router @softistx/riva @softistx/riva-react
```

## Setup

The middleware goes on the root route, the provider in the root component:

```tsx
// app/root.tsx
import { provideGraphQL, graphqlClientTransport } from '@softistx/riva-graphql';
import { RivaRouterProvider } from '@softistx/riva-react-router';
import { rivaMiddleware } from '@softistx/riva-react-router/server';
import { Outlet } from 'react-router';

export const middleware = [
	rivaMiddleware({
		// the caller port of the request: its session, its headers
		setup: (client, { request }) =>
			provideGraphQL(client, graphqlClientTransport(callerOf(request))),
	}),
];

export default function Root() {
	return (
		<RivaRouterProvider
			setup={(client, { server }) =>
				// the browser's own transport; on the server the snapshots are already there
				provideGraphQL(client, graphqlClientTransport(server ? serverCaller : browserCaller))
			}
		>
			<Outlet />
		</RivaRouterProvider>
	);
}
```

`/server` imports `node:async_hooks`: keep it out of the browser bundle (a `.server` module, or import it only from the route's `middleware` export).

## The loader pattern

A loader reads through the request's client, then returns its snapshot under `~riva`:

```tsx
import { riva, rivaOf } from '@softistx/riva-react-router';

export async function loader({ context }: Route.LoaderArgs) {
	await PATIENTS_QUERY_DEF.ensure(rivaOf(context), { school });
	return { ...riva(context), school };
}
```

The component just reads: `useQuery(PATIENTS_QUERY_DEF, { school })`. The provider hydrates each match's `~riva` once. The first render is seeded before its children read, so the server markup and the browser's first render agree and fresh data is not fetched again. On a navigation or revalidation, entries something observes (and entries with a cache policy) are applied in a layout effect, never during a render. Named signals that travel (`ssr: true`) are seeded once; a signal the browser already holds, and every local signal, keeps its value.

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
