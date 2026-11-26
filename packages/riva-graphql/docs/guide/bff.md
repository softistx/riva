# BFF mode

Entry points: `@softistx/riva-graphql/bff` (browser) and `@softistx/riva-graphql/server` (server).

## What it is for

In the browser, `bffTransport` posts `{ id, variables }` to your `dataRoute` (from `@softistx/riva-react-router/server`) and reads `{ data }` back, Dates included. The browser never sends a document: the route runs the manifest's text through the request riva, with the session your `setup` gave it.

## Browser

```ts
// app/riva.ts
import { createRiva } from '@softistx/riva';
import { graphql } from '@softistx/riva-graphql';
import { bffTransport } from '@softistx/riva-graphql/bff';

export const createBrowserRiva = () =>
	createRiva({ graphql: withGraphQL(bffTransport({ url: '/_data' })) });
```

## Server

```ts
// app/routes/_data.ts (a route with an action and a loader)
import { dataRoute } from '@softistx/riva-react-router/server';
import { allowlist } from '@softistx/riva-graphql/server';
import manifest from '../generated/allowlist.json';

const route = dataRoute({
	sources: [allowlist(manifest)],
});
export const action = route.action;
export const loader = route.loader;
```

## Options

`bffTransport(options?)`:

| Option | Default | Meaning |
|---|---|---|
| `url` | `/_data` | The data route. |
| `fetch` | global `fetch` | A fetch of your own. |
| `headers` | none | A function returning `HeadersInit`, called at each request: `headers: () => ({ 'x-csrf': token() })`. |

`allowlist(manifest)` is a `DataSource`: it knows only the manifest's ids, parses each document once, and runs it through the transport of the request riva (the one `withGraphQL(client)` installed, or `provideGraphQL` set).

## Errors

The route's refusals and the API's errors come back as `RivaRequestError` with the route's `code` and `status` (retryable for 5xx, 408 and 429). A failed fetch is a `RivaNetworkError`, an abort a `RivaAbortError`.

## Traps

- Keep `/bff` and `/server` out of each other's bundle: `/bff` is for the browser, `/server` imports `graphql`.
- An id that is not in the manifest is refused by the route: regenerate the allowlist after changing a document ([codegen](./codegen.md)).
- The request riva needs its own transport too (a riva made with `createRiva({ graphql: withGraphQL(client) })`, in `rivaMiddleware`'s `create`), or the allowlist has no transport to run through.
