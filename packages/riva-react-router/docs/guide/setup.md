# Setup

## What it is for

One `Riva` per request on the server, hydrated in the browser. The middleware creates it, the provider reads it. Built for React Router 8 framework mode (and `@softistx/alxia-react-router`, which hosts the same routes).

## Wire the root

`middleware` on a route module needs React Router 8 framework mode. Build the riva in one module both sides can import, put the middleware on the root route, and hand the same factory to the provider:

```ts
// app/riva.ts: one factory, so the request, the render and the browser build the same riva
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva } from '@softistx/riva';
import { graphql } from '@softistx/riva-graphql';

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

`RegisteredRiva` is what `rivaOf` returns (your registered riva, else `Riva`); `RivaFrom<R>` is the helper that reads `R['riva']`, falling back to `Riva`.

```ts
// app/riva.server.ts: built in a *.server.ts module, so /server stays out of the browser bundle
import { rivaMiddleware } from '@softistx/riva-react-router/server';
import { createAppRiva } from './riva';

export const rivaMw = rivaMiddleware({
	// the caller port of the request: here its session cookie goes to the API
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

The `graphql` extension installs the transport itself: no `provideGraphQL` call. For REST, add `rest: withRest(api)` to the same `createRiva` ([REST transport](https://github.com/softistx/riva/blob/develop/packages/riva-rest/docs/guide/transport.md)). A riva without extensions wires its transport in `setup` instead: [transport](https://github.com/softistx/riva/blob/develop/packages/riva-graphql/docs/guide/transport.md).

## Keep `/server` out of the browser

`/server` imports `node:async_hooks`, so it never goes in `app/root.tsx` directly: React Router never bundles a `*.server.ts` module for the browser, and the root imports the middleware from it by path, as above.

## Traps

- Declare the middleware once, on the root route: a second run in one request throws `rivaMiddleware ran twice in one request: declare it once, on the root route.`
- The `riva` prop must stay the same object for the lifetime of the mount (hold it in `useState`, as above), and `setup` must be idempotent: React StrictMode runs it twice in development.
- A provider without a `riva` prop makes a bare one: `riva.graphql` is then missing in the browser. Pass the factory's riva.
- The ambient scope is one `AsyncLocalStorage` per process, wired by importing `/server` (`setScopeResolver` is one per process: another resolver replaces it).
- With `@softistx/alxia-react-router`, put `rivaMiddleware` in the root route's `middleware`, beside alxia's own.

Fixes: [troubleshooting](../troubleshooting.md).
