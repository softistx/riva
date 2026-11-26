---
'@softistx/riva-react': minor
'@softistx/riva-graphql': minor
'@softistx/riva-rest': minor
---

One mutation-hook shape and a path-first `useRest`. No old name is kept as an alias.

`useMutation`, `useGraphQLMutation` and `useRestMutation` all return `{ run, status, data, error, reset }`; `run` and `reset` keep their identity across renders. `useRest(path | definition, input?, options?)` drops the leading `'get'`; the cache keys and SSR ids are unchanged.

**Breaking**

| Old | New |
|---|---|
| `const save = useGraphQLMutation(DOC); save(vars)` | `const { run } = useGraphQLMutation(DOC); run(vars)` |
| `const save = useRestMutation(method, path); save(input)` | `const { run } = useRestMutation(method, path); run(input)` |
| `useMutationHandle(...)` result called as a function | `const { run } = useMutationHandle(...)` |
| `isPending` (`useMutation`) | `status === 'loading'` |
| `useRest('get', path, input?, options?)` | `useRest(path, input?, options?)` (the old form throws `RIVA_DEFINITION`) |
| `MutationHook` (`@softistx/riva-react/resource`) | `MutationResult` (also exported by `@softistx/riva-react`) |
| `UntypedUseRestMutation` input default `unknown` | `RestInput`, as `riva.rest.mutation` |

New: `MutationResult` is re-exported (type) from `@softistx/riva-graphql/react` and `@softistx/riva-rest/react`.

The handle of `riva.graphql.mutation()` and `riva.rest.mutation()` stays callable.
