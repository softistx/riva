---
'@softistx/riva': minor
'@softistx/riva-react': minor
'@softistx/riva-graphql': minor
'@softistx/riva-rest': minor
'@softistx/riva-react-router': minor
---

Breaking: a mutation's `run` is now `mutate`, with no alias. The option, the definition method and the hooks' result are renamed together; `riva.run(() => …)` (the scope runner) and the `/_data` operations' `run` are unchanged.

Migration:

- `def.run(riva, vars)` becomes `def.mutate(riva, vars)` (core, `riva.graphql.mutation`, `riva.rest.mutation`).
- `mutation({ id, run })` becomes `mutation({ id, mutate })` (core and the REST free form).
- `const { run } = useMutation(def)` becomes `const { mutate } = useMutation(def)`; the same for `useGraphQLMutation`, `useRestMutation` and `useMutationHandle`.
- `mutationHandle(riva, run)` keeps its shape; only the parameter is named `mutate`.
