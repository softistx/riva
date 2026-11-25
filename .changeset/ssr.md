---
'@softistx/riva': minor
---

Add `@softistx/riva/ssr`: `dehydrate(client)` makes a JSON-safe snapshot of the settled query entries and the named atoms that opted in with `ssr: true`, `hydrate(client, snapshot)` seeds a client from it (entries and atoms are seeded when their definition is first used, ages travel instead of clocks, fresh data is not refetched, `deferObserved` returns the observed entries to apply later), and `encode` / `decode` is the tagged codec (Dates, `NaN` and the infinities survive; a refused value throws `RIVA_SSR`). Errors travel as codes only and come back as their class by code. `setScopeResolver(fn)` (one per process) lets a host supply the ambient client. Dates in cached values round trip through a snapshot.

`atom`'s `ssr` option now defaults to `false`: an atom travels in a snapshot only with `ssr: true` and a `name`.
