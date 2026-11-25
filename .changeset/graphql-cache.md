---
'@softistx/riva-graphql': minor
---

Add `@softistx/riva-graphql/cache`: `normalized()`, a selection-aware normalized cache for `query(DOC, { cache: normalized() })` and `mutation`. It walks the operation's selection set (aliases, field arguments, inline and named fragments, `possibleTypes`) and stores entities in the core entity store, so `readEntity`, `writeEntity`, `useFragment` and optimistic layers keep working. `query()` and `mutation()` accept an `OperationCache`. A document with a missing `__typename` throws a `RivaError` with the `RIVA_DEFINITION` code.
