---
'@softistx/riva': minor
---

Entries seeded by `hydrate` are fresh for 1 s (the suspense floor) when neither the call, the definition nor `defaults.staleTime` sets a `staleTime`, so a hydrated page does not refetch everything on mount. An explicit `staleTime`, 0 included, always wins.
