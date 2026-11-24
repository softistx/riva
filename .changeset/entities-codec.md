---
'@softistx/riva': minor
---

Additive: a cache policy's `write`, `layer` and `commit` receive the operation's variables; `entities(opts, codec)` takes an `EntityCodec` (over an `EntityReader`) to normalize and denormalize differently; `@softistx/riva/entities` exports `isPlain`, `isRef` and the types `EntityCodec`, `EntityReader`, `Normalized`, `Ref`. A plain read skips argument-field keys. An observed query whose cache reads `undefined` although it holds data is now invalidated and refetched once; if the refetch also reads `undefined` it ends in the error status with `RIVA_CACHE`.
