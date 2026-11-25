---
'@softistx/riva-rest': minor
'@softistx/riva-react-router': patch
---

Add BFF mode for REST: `@softistx/riva-rest/bff`'s `bffTransport` posts `{ id: 'rest:<operationId>', variables }` to a `/_data` route from the browser (errors come back as the core's classes), and `@softistx/riva-rest/server`'s `operations(api)` runs the spec's operations on the server through the request client's REST transport. In the browser a free fetcher that reads `http` throws `RivaScopeError` naming server-only use.
