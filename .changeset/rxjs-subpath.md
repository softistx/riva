---
'@softistx/riva': minor
---

Add the `@softistx/riva/rxjs` subpath: `toObservable(riva, def, vars?)` returns a cold Observable of full states for a query (subscribing observes it like `useQuery`, unsubscribing releases it, an error is a value), a signal, a computed or a mutation handle; `data$` maps to the data alone; `fromAsyncIterable` (also reachable as `toObservable(iterable)`) turns an async iterable into an Observable, calling `return()` on unsubscribe. `rxjs ^7.8` is an optional peer, imported only by this subpath.
