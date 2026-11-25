---
'@softistx/riva': minor
'@softistx/riva-graphql': patch
'@softistx/riva-rest': patch
'@softistx/riva-react': patch
---

Share what the adapters copied. `@softistx/riva/resource` exports `trackedInput`, `isReactive`, `abortable`, `callResource` and `mutateInvalidating` (and the `TrackedInput` and `CallOptions` types); `riva-graphql` and `riva-rest` use them for their calls, and `riva-react/resource` adds `useCallResource`, which `useGraphQL` and `useRest` share. `useMutation` now reuses `mutationHandle`'s last-call-wins. No behaviour change.
