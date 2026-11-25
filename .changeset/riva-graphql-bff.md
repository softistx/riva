---
'@softistx/riva-graphql': minor
---

Add BFF mode: `@softistx/riva-graphql/bff`'s `bffTransport` posts `{ id, variables }` to a `/_data` route from the browser, and `@softistx/riva-graphql/server`'s `allowlist` runs the codegen manifest's operations on the server through the request client.
