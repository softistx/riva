---
'@softistx/riva-react': minor
'@softistx/riva-graphql': minor
'@softistx/riva-rest': minor
---

Hooks per namespace. `@softistx/riva-graphql/react` adds `useGraphQL(DOC, vars, opts)`, `useGraphQLMutation(DOC)` and `useGraphQLSubscription(DOC, vars, opts)`; `@softistx/riva-rest/react` adds `useRest('get', path, input, opts)` and `useRestMutation(method, path)` (typed by augmenting the `Register` interface with the operations table). They return the resource state (`idle | loading | success | error`); mutations also return the callable handle with `reset`. `{ suspense: true }` suspends until data and types the state as success. `enabled`, function variables and `keepPrevious` work as on `riva.graphql` and `riva.rest`; a server render reads the request's riva, seeds and dehydrates, and hydration does not refetch fresh data.

`@softistx/riva-react/resource` is a new subpath with the generic building blocks the adapters use: `useResource`, `useMutationHandle` and `useStableInput`. The main entry is unchanged.

`react` and `@softistx/riva-react` are optional peers of the two adapters (`^19` and `^0.3.0`); `@softistx/riva-react` now peers on `@softistx/riva` `^0.3.0`.
