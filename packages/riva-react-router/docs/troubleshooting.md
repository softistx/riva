# Troubleshooting

Each entry is headed by the message you will see.

## `No RivaClient in this request: add rivaMiddleware() from @softistx/riva-react-router/server to the root route's middleware.`

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** `rivaOf(context)` or `riva(context)` ran in a loader or action of a request where the middleware did not run.

**Why:** `rivaOf` and `riva` are for server loaders and actions only (`clientLoader` is not supported), and the request's client is created by the middleware and put in the router context; nothing else makes one.

**Fix:** declare it on the root route.

```tsx
import { rivaMiddleware } from '@softistx/riva-react-router/server';

export const middleware = [rivaMiddleware({ setup })];
```

## `rivaMiddleware ran twice in one request: declare it once, on the root route.`

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** the middleware is listed on the root route and on a nested route (or twice on one).

**Why:** a second run would replace the request's client, and loaders that ran before would have filled another.

**Fix:** keep the single declaration on the root route.

## `revalidate is observed by RivaRouterProvider: render it above the component that invalidates it.`

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** `revalidate` was invalidated (a mutation's `invalidates`, `invalidateOnAction`, or `revalidate.invalidate(client)`) on a client no `RivaRouterProvider` renders for.

**Why:** the provider leaves the router's `revalidate()` on the client; with no provider there is nothing to call.

**Fix:** render `RivaRouterProvider` above the component, with the same `client`.

## `RIVA_DATA_*` refusals from `dataRoute`

Codes: `RIVA_DATA_METHOD` (405), `RIVA_DATA_CROSS_SITE` (403), `RIVA_DATA_MEDIA_TYPE` (415), `RIVA_DATA_TOO_LARGE` (413), `RIVA_DATA_BAD_REQUEST` (400, also for variables that cannot be decoded), `RIVA_DATA_UNKNOWN` (404) and `RIVA_DATA_INTERNAL` (500), typed as `DataRouteCode`.

**When:** the browser's call to the `/_data` route is refused.

**Why and fix:** each code's cause and fix is in the [`riva-graphql` table](https://github.com/softistx/riva/blob/develop/packages/riva-graphql/docs/troubleshooting.md#riva_data_-refusals-from-the-_data-route). A network or HTTP failure of the API reaches the browser with its code and the message "The API is unavailable."; the original error goes to `dataRoute`'s `onError`.

## Data refetches right after hydration

**When:** the browser fetches a query it received from the loader.

**Why:** the entry's age travels with the snapshot, so its freshness is the definition's `staleTime` minus that age. With the default `staleTime` of 0 the data is stale the moment it lands.

**Fix:** give the definition a `staleTime` that covers the navigation.

```ts
import { query } from '@softistx/riva-graphql';

export const patients = query(PATIENTS_QUERY, { staleTime: '30s' });
```
