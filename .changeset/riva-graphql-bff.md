---
'@softistx/riva-graphql': minor
---

Add BFF mode: `@softistx/riva-graphql/bff`'s `bffTransport` posts `{ id, variables }` to a `/_data` route from the browser, and `@softistx/riva-graphql/server`'s `allowlist` runs the codegen manifest's operations on the server through the request client. Its `bffTransport` runs on `@softistx/riva/data`'s `postData`, and `BffTransportOptions` is re-exported from `/bff`. `allowlist()` takes the manifest as a JSON import (`AllowlistInput`, `kind` typed as a `string`) and checks each operation's kind at run time, refusing an unknown kind with a message that says to rerun the codegen.
