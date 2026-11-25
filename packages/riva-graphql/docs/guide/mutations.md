# Mutations

## What it is for

`mutation(document, options?)` runs a write typed from its document, with optimistic updates, cache updates and invalidation.

## Define and run

```ts
import { mutation } from '@softistx/riva-graphql';
import { patients } from './queries';
import { RENAME_PATIENT_MUTATION } from './graphql';

export const renamePatient = mutation(RENAME_PATIENT_MUTATION, {
	invalidates: [patients], // observed lists refetch once it succeeded
});

await renamePatient.run(riva, { id: '1', name: 'Ana' }); // rejects after the rollback
```

## Options

`GraphQLMutationOptions` is the core's mutation options, typed from the document, plus `cache`.

| Option | Default | Meaning |
|---|---|---|
| `id` | the persisted id, else the operation name | Override the derived id. |
| `optimistic(vars, tx)` | none | Shows the expected result at once; returns the document's data (for the `cache` layer) or writes with `tx.set`. Rolled back on failure. |
| `updates(tx, data, vars)` | none | On success, writes the committed data. |
| `invalidates` | none | `[query]`, `[at(query, vars)]` or `(data, vars) => [...]`: queries marked stale on success. |
| `cache` | none | A core policy or `normalized()`: the result updates every entity it returns. |
| `retry` | `0` | A count, or `(failures, error) => boolean`. |
| `retryDelay` | `min(1000 * 2 ** failures, 30000)` | `(failures) => ms`. |

## Traps

- `run` rejects after the rollback: catch it, or read the error on the React hook.
- With `normalized()`, the optimistic data must include `__typename` and `id`.
