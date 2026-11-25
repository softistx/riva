---
'@softistx/riva': minor
---

Add the query engine: `query` definitions with `ensure`, `prefetch`, `invalidate`, `setData` and `cancel`, `client.get` and `client.subscribe` for queries, dedupe, `staleTime`, `gcTime`, retry with backoff, refetch on focus and reconnect, polling, abort end to end, injectable scheduler and events, duration strings (`"30s"`), stable cache keys (`stableKey`), and the request errors (`RivaRequestError`, `RivaHttpError`, `RivaNetworkError`, `RivaAbortError`). `client.subscribe(def, vars, listener, { staleTime })` lets an observer override the definition's `staleTime` for its first fetch decision only. Two definitions sharing an id are refused on the server with `RIVA_KEY` (in a browser the newest takes the entry over, for hot reload). `isRetryableStatus(status)` tells whether an HTTP status is worth retrying (5xx, 408, 429), and every adapter uses it.
