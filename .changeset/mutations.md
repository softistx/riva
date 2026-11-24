---
'@softistx/riva': minor
---

Add `mutation()` with an optimistic layer (keyed `tx.set` and `entities()` layers), rollback on failure, `updates` and `invalidates` on success, start-order settling per client, retry and abort. `CachePolicy` gains the optional `layer` and `commit` methods.
