# Mutations: `useMutation`

`useMutation(def)` holds its status per hook instance. `run` resolves with the server data and rejects with the error (also in `error`); the mutation finishes even if the component unmounts, it only stops reporting. When runs overlap, the latest owns the state.

```tsx
import { mutation } from '@softistx/riva';
import { useMutation } from '@softistx/riva-react';

const rename = mutation({
	id: 'renamePatient',
	run: (vars: { id: string; name: string }, { signal }) => sendRename(vars, signal), // Promise<Patient>
	invalidates: [patients],
});

function Rename({ id }: { id: string }) {
	const { run, isPending, error, reset } = useMutation(rename);
	return (
		<button disabled={isPending} onClick={() => run({ id, name: 'New name' }).catch(() => {})}>
			Rename
		</button>
	);
}
```

## Result

| Field | Meaning |
| --- | --- |
| `run(vars, opts?)` | Runs the mutation; `opts` is `{ signal? }`. Resolves with the data, rejects with the error. |
| `status` | `idle`, `pending`, `success` or `error`. |
| `data` | The last result of the latest run. |
| `error` | The last error of the latest run. |
| `isPending` | `status === 'pending'`. |
| `reset()` | Back to `idle`, clears `data` and `error`. |

The definition's own options (`optimistic`, `updates`, `invalidates`, `cache`, `retry`) apply: see the core's [mutations guide](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/mutations.md).

## Traps

- `run` rejects: catch it (`.catch(() => {})`) when you read the error from the hook, or you get an unhandled rejection (see [troubleshooting](../troubleshooting.md)).
- Unmounting does not cancel the mutation; pass a `signal` to `run` to abort it.
