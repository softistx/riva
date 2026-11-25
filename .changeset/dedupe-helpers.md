---
'@softistx/riva': minor
'@softistx/riva-react': minor
'@softistx/riva-graphql': patch
'@softistx/riva-rest': patch
---

Share what the adapters copied. `@softistx/riva/resource` exports `trackedInput`, `isReactive`, `abortable`, `callResource` and `mutateInvalidating` (typed over the definition's variables and data) and the `TrackedInput` and `CallOptions` types; `riva-graphql` and `riva-rest` use them for their calls. `riva-react/resource` adds `useCallResource`, which `useGraphQL` and `useRest` share. `useMutation` now reuses `mutationHandle`'s last-call-wins; one visible detail: passing a different mutation definition resets the hook to `idle` and a run still in flight from the previous one stops reporting. Otherwise no behaviour change.
