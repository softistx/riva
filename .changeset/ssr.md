---
'@softistx/riva': minor
---

Add `@softistx/riva/ssr`: `dehydrate(client)` makes a JSON-safe snapshot of the settled query entries and the changed named atoms, `hydrate(client, snapshot)` seeds a client from it (entries and atoms are seeded when their definition is first used, ages travel instead of clocks, fresh data is not refetched, `deferObserved` returns the observed entries to apply later), and `encode` / `decode` is the tagged codec (Dates, `NaN` and the infinities survive; a refused value throws `RIVA_SSR`). `setScopeResolver(fn)` lets a host supply the ambient client. Dates in cached values round trip through a snapshot.
