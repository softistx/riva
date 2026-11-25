---
'@softistx/riva': minor
'@softistx/riva-react': minor
'@softistx/riva-graphql': minor
'@softistx/riva-rest': minor
'@softistx/riva-react-router': minor
---

`RivaClient` is renamed `Riva`: the instance holds local state too, so it is not a client.

| Before | After |
| --- | --- |
| `RivaClient` | `Riva` |
| `createRivaClient` | `createRiva` |
| `ClientOptions`, `ClientEvents` | `RivaOptions`, `RivaEvents` |
| `setDefaultClient` | `setDefaultRiva` |
| `useClient` (riva-react) | `useRiva` |
| `<RivaProvider client={client}>` | `<RivaProvider riva={riva}>` |
| store action context `{ client, fetch, mutate }` | `{ riva, fetch, mutate }` |
| `RivaRouterProvider` `client` prop | `riva` (`RivaRouterProvider` gets no deprecated alias for it) |
| the `FetchContext` and free-fetcher context `client` | `riva` |

Error messages follow: `No Riva in scope: wrap the tree in <RivaProvider riva={riva}>. On the server, create one per request.` Error codes are unchanged.

The old names stay for one minor as deprecated aliases (the same references, so `instanceof` still holds): `RivaClient` (value and type), `createRivaClient`, `ClientOptions`, `ClientEvents`, `setDefaultClient`, `useClient`, and `RivaProvider` still accepts `client`. They are removed in the next minor. Objects named `client` that are genuinely network clients (`@softistx/graphql-client`, httpyz and OpenAPI clients) keep their names.
