---
'@softistx/riva': minor
---

Add cursor pagination as the opt-in `@softistx/riva/infinite` entry: `infinite()` defines a list whose data is the loaded pages, with `fetchNext`, `fetchPrevious`, a refetch of every loaded page, and `hasNext`, `hasPrevious` and the flattened `nodes` on the state. `Query` gains an optional state type, which `client.get` and `subscribe` return.
