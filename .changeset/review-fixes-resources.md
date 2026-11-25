---
'@softistx/riva': patch
'@softistx/riva-react': patch
'@softistx/riva-graphql': minor
'@softistx/riva-rest': minor
---

`keepPrevious` never shows another key's data across a disabled gap: a resource that went `idle` (`enabled` false) and comes back under a new key shows `loading`, in the core `resource` and in `useResource`. A signal or computed passed as the variables or input of a hook is keyed by identity, so a change of its value fetches the new key once and does not reopen a stream (a function input still follows the render).

**Breaking (types):** `useGraphQL` and `useRest` refuse `enabled` together with `suspense: true`, since a suspending hook has data or throws and is never `idle`; the non-suspense overload takes `suspense?: false`. Migration: drop `enabled` from a suspending call (render the component once its variables are known) or leave `suspense` off. `useResource` with `suspense` is typed `SuspendedState<D> | IdleState`.
