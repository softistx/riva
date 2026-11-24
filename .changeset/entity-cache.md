---
'@softistx/riva': minor
---

Add the entity cache as the opt-in `@softistx/riva/entities` entry: `entities()` (a `cache` policy that normalizes query data into shared entities, with identity by `__typename` and `id`, `keys` or a custom `identify`, structural sharing and reference-counted collection), `readEntity`, `writeEntity`, `evict`, `invalidateEntity` and `identifyOf`, and the `RIVA_CACHE` error. The main entry gains the `cache` query option and the `CachePolicy` type.
