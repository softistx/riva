---
'@softistx/riva': minor
---

Add `liveQuery({ id, observe })` to `@softistx/riva/rxjs`: a query fed by an Observable, used like any query (`riva.get`, `subscribe`, `ensure`, `useQuery(liveQuery)`), with a derived key and a cache. On the server `ensure()` resolves at the first value, then unsubscribes (the request signal stops a silent stream), and the snapshot carries the value. In a browser it is subscribed while observed and kept for `gcTime` after the last release; an error keeps the last data and `refetch()` (or a new observer) subscribes again; `complete` keeps the last value (a stream that completes without a value rejects).
