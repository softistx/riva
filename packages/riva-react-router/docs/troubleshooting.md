# Troubleshooting

Each entry is headed by the message you will see.

## `No RivaClient in this request: add rivaMiddleware() from @softistx/riva-react-router/server to the root route's middleware.`

Code: `RIVA_SCOPE` (`RivaScopeError`).

**When:** `rivaOf(context)` or `riva(context)` ran in a loader or action of a request where the middleware did not run.

**Why:** the request's client is created by the middleware and put in the router context; nothing else makes one.

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

## Data refetches right after hydration

**When:** the browser fetches a query it received from the loader.

**Why:** a query's `staleTime` defaults to 0, so data is stale the moment it lands. Hydration seeds the entry but never marks it fresh beyond its definition's policy.

**Fix:** give the definition a `staleTime` that covers the navigation.

```ts
const PATIENTS = query(PATIENTS_DOC, { staleTime: '30s' });
```
