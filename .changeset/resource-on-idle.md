---
'@softistx/riva': patch
---

Fixes a resource that stayed observed (never garbage-collected, still refetching) after its last computed or effect reader was dropped, when its entry had no polling. The resource now stops at the next microtask.
