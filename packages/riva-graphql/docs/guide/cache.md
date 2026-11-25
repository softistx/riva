# Normalized cache

## What it is for

`normalized()` stores each object that has a `__typename` and an `id` once, as an entity, so two queries that show the same patient update each other, and a mutation's result updates every query showing it. It is built on the core entity store (`@softistx/riva/entities`).

## Use it

```ts
import { mutation, query } from '@softistx/riva-graphql';
import { normalized } from '@softistx/riva-graphql/cache';
import { PATIENT_QUERY, PATIENTS_QUERY, RENAME_PATIENT_MUTATION } from './graphql';

const cache = normalized({ possibleTypes: { Person: ['Patient', 'Doctor'] } });

export const patient = query(PATIENT_QUERY, { cache });
export const patients = query(PATIENTS_QUERY, { cache });
export const rename = mutation(RENAME_PATIENT_MUTATION, {
	cache, // the mutation's result updates every entity it returns
	optimistic: (v) => ({ renamePatient: { __typename: 'Patient', id: v.id, name: v.name } }),
});
```

`query()` and `mutation()` take `cache?: CachePolicy | OperationCache`: a core policy as is, or an object with `forOperation(op)` returning the policy for the operation (`op.document`, `name`, `kind`, `id`). `normalized()` is one; a cache of your own implements `forOperation` the same way. `infinite()` and the core `query()` take core policies only.

## Options

| Option | Default | Meaning |
|---|---|---|
| `possibleTypes` | none | Maps each interface or union to its member type names (`{ Person: ['Patient', 'Doctor'] }`, as codegen's `fragment-matcher` writes it); may nest abstract types. |
| `keys` | `id`, then `_id` | Core identity option: `{ Type: (obj) => string }`, the identity of a type. |
| `identify` | the rule above | Core identity option: `(obj) => 'Type:id' \| undefined`, replaces the identity rule altogether. |

## How it reads

- **Objects without an id** are stored inside their parent, merged with what another query stored for the same field. When a shared scalar disagrees (a reordered list) the stored object is replaced, so another query selecting more fields of it refetches once.
- **Aliases** are stored under the field's name and read back under the response key.
- **Field arguments** get one stored field per argument set, variables resolved. `readEntity` and a plain `entities()` read skip those keys; read them through the query.
- **Fragments** (inline and named) and type conditions work. Without `possibleTypes`, a fragment on an abstract type is applied only to objects whose `__typename` equals its condition.
- **A miss is a miss**: if a selected field or entity is missing from the store, the query's data is `undefined`, never half-served. An observed query then refetches.

## Traps

- **Selections must include `__typename`** below the operation's root, selected directly (or in an inline fragment with no type condition). Otherwise `query()` or `mutation()` throws a `RivaError` (`RIVA_DEFINITION`); the document is never rewritten, since a persisted id is the hash of its text. The client preset's `addTypenameSelectionDocumentTransform` adds it.
- A fetch result that is itself missing a selected field ends the query in the error status with code `RIVA_CACHE` (`ensure` rejects with it) instead of looping.
- The cache holds JSON: a `Date`, a function or a `NaN` in a result throws a `RivaError` with code `RIVA_CACHE`.
- Share one `normalized()` between a client's definitions: a second one with other identity rules is refused by the core ([troubleshooting](../../../riva/docs/troubleshooting.md#this-client-already-uses-other-entity-identity-rules)).
