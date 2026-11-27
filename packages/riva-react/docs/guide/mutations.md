# Mutations: `useMutation`

> Most call sites read GraphQL or REST with the hooks of the adapters (`useGraphQL`, `useRest`: see the [resource hooks](./resource.md)). This page covers the hook over a definition, for settings several call sites share: see [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md).

`useMutation(def)` holds its status per hook instance. `mutate` resolves with the server data and rejects with the error (also in `error`); the mutation finishes even if the component unmounts, it only stops reporting. When runs overlap, the latest owns the state.

```tsx
import { mutation } from '@softistx/riva';
import { useMutation } from '@softistx/riva-react';

const rename = mutation({
	id: 'renamePatient',
	mutate: (vars: { id: string; name: string }, { signal }) => sendRename(vars, signal), // Promise<Patient>
	invalidates: [patients],
});

function Rename({ id }: { id: string }) {
	const { mutate, status, error, reset } = useMutation(rename);
	return (
		<button disabled={status === 'loading'} onClick={() => mutate({ id, name: 'New name' }).catch(() => {})}>
			Rename
		</button>
	);
}
```

## Result

| Field | Meaning |
| --- | --- |
| `mutate(vars, opts?)` | Runs the mutation; `opts` is `{ signal? }`. Resolves with the data, rejects with the error. |
| `status` | `idle`, `loading`, `success` or `error`. |
| `data` | The last result of the latest run. |
| `error` | The last error of the latest run. |
| `reset()` | Back to `idle`, clears `data` and `error`. |

`mutate` and `reset` keep their identity across renders (also from `idle` to `loading` to `success`). There is no `isPending`: read `status === 'loading'`. `useGraphQLMutation` and `useRestMutation` return the same shape (type `MutationResult`).

The definition's own options (`optimistic`, `updates`, `invalidates`, `cache`, `retry`) apply: see the core's [mutations guide](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/mutations.md).

## Traps

- `mutate` rejects: catch it (`.catch(() => {})`) when you read the error from the hook, or you get an unhandled rejection (see [troubleshooting](../troubleshooting.md)).
- Unmounting does not cancel the mutation; pass a `signal` to `mutate` to abort it.
