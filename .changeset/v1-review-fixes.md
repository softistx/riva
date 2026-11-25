---
'@softistx/riva': patch
'@softistx/riva-react': patch
'@softistx/riva-graphql': patch
'@softistx/riva-rest': patch
'@softistx/riva-react-router': patch
---

Review fixes before v1. Two query definitions sharing an id are refused on the server with `RIVA_KEY` ("Two definitions share the id ..."), and in a browser the newest takes the entry over (hot reload). `isRetryableStatus(status)` is exported from the core and used by every adapter. A misused definition (an unnamed or wrong-kind document, a route that does not fit, a missing `id`, a missing `__typename`) throws a `RivaError` with the new `RIVA_DEFINITION` code instead of a `TypeError`. `allowlist()` takes the manifest as a JSON import (`kind` as a `string`) with no assertion, and refuses an unknown kind with a message that says to rerun the codegen. The hard-coded `VERSION` export is removed from every barrel. `@softistx/riva-react-router` declares its server entry as its only side effect and the other packages declare none, so bundlers can tree-shake them. The five packages are released in lockstep (`fixed`).
