---
'@softistx/riva': minor
---

Additive: a cache policy's `write`, `layer` and `commit` receive the operation's variables; `entities(opts, codec)` takes an `EntityCodec` (over an `EntityReader`) to normalize and denormalize differently; `@softistx/riva/entities` exports `isPlain`, `isRef` and the types `EntityCodec`, `EntityReader`, `Normalized`, `Ref`. A plain read skips argument-field keys. An observed query whose stored data stops reading through its cache policy is refetched (and `ensure` fetches); a fetch whose result cannot be read back ends in the error status with `RIVA_CACHE` ("The cache cannot read the query's data after a fetch.") and `ensure` rejects, with no loop.
