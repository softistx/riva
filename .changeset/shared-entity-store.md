---
'@softistx/riva': minor
'@softistx/riva-rest': minor
'@softistx/riva-graphql': minor
---

One entity store per riva, shared by every policy on it: `entities()`, `restEntities()` and `normalized()` policies with different `keys` now merge their keys per type instead of being refused. The same type keyed by two different functions, or a key added for a type the store already holds, throws `RIVA_CACHE`; a custom `identify` stays exclusive.
