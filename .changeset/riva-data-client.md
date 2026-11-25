---
'@softistx/riva': minor
---

Add `@softistx/riva/data`: `postData`, the browser's client of a `/_data` route (posts `{ id, variables }` in the SSR codec, reads `{ data }`, throws the route's errors as the core's classes), and the type `BffTransportOptions`; the main entry exports the `DataOperation` and `DataSource` types, the shape a `/_data` route's operations share between its adapters. The adapters' `bffTransport` share it.
