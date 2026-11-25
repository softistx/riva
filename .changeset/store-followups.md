---
'@softistx/riva': patch
'@softistx/riva-react': patch
---

Store follow-ups. A store definition replaced by a hot reload no longer takes its name back when a component still holding it is read again: it resolves to the current instance, with no reset of the state (the server still refuses a duplicate name). The browser test is shared with the query entry (`'document' in globalThis`) and the `happy-dom`/`jsdom` case is documented. The limit of `useStore` for a `memo` child that alone reads a new key is documented, and a spec covers a render React discards leaving its keys uncommitted.
