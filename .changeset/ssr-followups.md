---
'@softistx/riva': patch
---

Hydrating with `deferObserved` no longer writes an entry twice: an entry seeded on creation is taken out of the deferred snapshot, so its observer is notified once.
