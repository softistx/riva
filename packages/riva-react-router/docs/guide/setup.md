# Setup

## What it is for

One `RivaClient` per request on the server, hydrated in the browser. The middleware creates it, the provider reads it. Built for React Router 8 framework mode (and `@softistx/alxia-react-router`, which hosts the same routes).

## Wire the root

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
			setup={(client) =>
				provideGraphQL(client, graphqlClientTransport(createGraphQLClient({ url: API_URL })))
			}
		>
			<Outlet />
		</RivaRouterProvider>
	);
}
```

## Options

`rivaMiddleware(options?)` (from `/server`):

| Option | Default | Meaning |
|---|---|---|
| `create(args)` | `createRivaClient()` | Makes the request's client. `args` are the middleware's (`request`, `context`, `params`). |
| `setup(client, { request, context })` | none | Wires the client before the loaders run: the caller port of the request (a transport with the session). May be async. |

`<RivaRouterProvider>` props:

| Prop | Default | Meaning |
|---|---|---|
| `client` | a client made once per mount | The client the render and the browser use. |
| `setup(client)` | none | Wires it (a browser transport). |
| `invalidateOnAction` | none | Definitions invalidated each time a non-GET navigation or fetcher settles ([after a write](./after-a-write.md)). |
| `children` | required | The app. |

## Keep `/server` out of the browser

`/server` imports `node:async_hooks`. Build the middleware in a `*.server.ts` module (React Router never bundles it for the browser) and import it from the root:

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

## Traps

- Declare the middleware once, on the root route: a second run in one request throws `rivaMiddleware ran twice in one request: declare it once, on the root route.`
- The `client` prop must stay the same object for the lifetime of the mount, and `setup` must be idempotent: React StrictMode runs it twice in development.
- The ambient scope is one `AsyncLocalStorage` per process, wired by importing `/server` (`setScopeResolver` is one per process: another resolver replaces it).
- With `@softistx/alxia-react-router`, put `rivaMiddleware` in the root route's `middleware`, beside alxia's own.

Fixes: [troubleshooting](../troubleshooting.md).
