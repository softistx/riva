---
'@softistx/riva': patch
---

Fixes a resource that stayed observed (never garbage-collected, still refetching) after its last computed or effect reader was dropped, when its entry had no polling. The resource now stops at the next microtask, and starts again when a reader (a cached computed included) observes it again.
