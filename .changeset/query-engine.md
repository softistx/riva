---
'@softistx/riva': minor
---

Add the query engine: `query` definitions with `ensure`, `prefetch`, `invalidate`, `setData` and `cancel`, `client.get` and `client.subscribe` for queries, dedupe, `staleTime`, `gcTime`, retry with backoff, refetch on focus and reconnect, polling, abort end to end, injectable scheduler and events, duration strings (`"30s"`), stable cache keys (`stableKey`), and the request errors (`RivaRequestError`, `RivaHttpError`, `RivaNetworkError`, `RivaAbortError`). `client.subscribe(def, vars, listener, { staleTime })` lets an observer override the definition's `staleTime` for its first fetch decision only.
