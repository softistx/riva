---
'@softistx/riva': minor
'@softistx/riva-react': minor
'@softistx/riva-react-router': minor
---

**Breaking:** the deprecated aliases announced in 0.2.0 are removed. In `@softistx/riva`: `RivaClient`, `createRivaClient`, `setDefaultClient`, `ClientOptions` and `ClientEvents`. In `@softistx/riva-react`: `useClient` and the `client` prop of `RivaProvider`. In `@softistx/riva-react-router`: the `client` prop of `RivaRouterProvider`.

Migration: `new RivaClient(...)` and `createRivaClient(...)` become `createRiva(...)`, `RivaClient` as a type becomes `Riva`, `setDefaultClient` becomes `setDefaultRiva`, `ClientOptions` becomes `RivaOptions`, `ClientEvents` becomes `RivaEvents`, `useClient()` becomes `useRiva()` and `<RivaProvider client={riva}>` becomes `<RivaProvider riva={riva}>` (the same for `RivaRouterProvider`).

`createRiva` now refuses a misspelt option at the type level: a key that is not a `RivaOptions` key must be an extension, so `createRiva({ default: ... })` no longer compiles.
