---
'@softistx/riva': minor
'@softistx/riva-react': minor
'@softistx/riva-graphql': patch
'@softistx/riva-rest': minor
'@softistx/riva-react-router': minor
---

`@softistx/riva/resource`: `resource(riva, source, opts)` is a reactive, awaitable view of a query entry (tracked variables, `enabled`, `keepPrevious` with `placeholder`, lazy observation); `mutationHandle(riva, run)` gives a callable with a reactive `state` and `reset`; `streamResource(riva, source, opts)` turns an async-iterable factory into a resource. Breaking: the query status `pending` is now `loading` (also the status of `useMutation`; `isPending` stays). The adapters only rename the status.

**Breaking:** the `useMutation` status `pending` is now `loading` (`riva-react`; `isPending` stays). Migration: compare `status === 'loading'` where you compared `'pending'`; the other adapters only re-export the renamed status.
