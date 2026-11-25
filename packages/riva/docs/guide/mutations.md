# Mutations

`mutation({ id, run, optimistic?, updates?, invalidates?, cache?, retry?, retryDelay? })` sends a change and shows its expected result at once. The definition is stateless; `run(riva, vars, { signal? })` resolves with the server data, or rejects with the error after the rollback.

```ts
import { at, createRiva, mutation, query } from '@softistx/riva';

const todos = query({ id: 'todos', fetch: async () => (await fetch('/api/todos')).json() as Promise<string[]> });

const addTodo = mutation<string, string>({
	id: 'addTodo',
	run: async (title, { signal }) =>
		(await fetch('/api/todos', { method: 'POST', body: title, signal })).text(),
	// shown at once, over the committed data; the updater gets the value below
	optimistic: (title, tx) => tx.set(todos, undefined, (prev) => [...(prev ?? []), title]),
	// on success: write the server result into the committed data...
	updates: (tx, saved) => tx.set(todos, undefined, (prev) => [...(prev ?? []), saved]),
	// ...and/or mark queries stale (observed ones refetch)
	invalidates: [todos], // or [at(todos, vars)] for one entry, or (data, vars) => [...]
});

const riva = createRiva();
await addTodo.run(riva, 'Buy milk'); // rejects, with the layer dropped, on failure
```

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `id` | required | Identifies the definition. |
| `run(vars, { signal })` | required | Sends the change; returns the server data. |
| `optimistic(vars, tx)` | none | Shows the expected result at once. Returns data for the entity layer (with `cache`), or writes with `tx.set`. |
| `updates(tx, data, vars)` | none | On success, writes the committed data. |
| `invalidates` | none | `[query]`, `[at(query, vars)]` or `(data, vars) => [...]`: queries to mark stale on success. |
| `cache` | none | A policy with `layer` and `commit` (`entities()` has both): normalizes the optimistic data and the result. |
| `retry` | `0` | A count, or `(failures, error) => boolean`. No timer is armed on the server. |
| `retryDelay` | `min(1000 * 2 ** failures, 30000)` | `(failures) => ms`. |

`tx.set(query, vars, dataOrUpdater)` writes one entry. In `optimistic` it adds a layer over the query's data, dropped when the mutation settles (the updater gets the value below). In `updates` it writes the committed data (the updater gets the committed value). `at(query, vars)` names one entry for `invalidates`, with `vars` checked against the query.

## With the normalized cache

```ts
import { entities } from '@softistx/riva/entities';

type Patient = { __typename: 'Patient'; id: string; name: string };

const renamePatient = mutation<{ id: string; name: string }, Patient>({
	id: 'renamePatient',
	cache: entities(),
	run: async (v) => (await fetch(`/api/patients/${v.id}`, { method: 'PATCH', body: JSON.stringify(v) })).json(),
	optimistic: (v) => ({ __typename: 'Patient', id: v.id, name: v.name }), // every query reading Patient:<id> shows it
});
```

## How it behaves

- **The layer.** While a mutation is in flight its optimistic writes sit above the committed cache. `riva.get`, `subscribe` and computeds see the committed data with the layers applied in start order; the committed data is never mutated. A keyed layer never changes `status` or `isFetching`. A refetch that lands meanwhile updates the committed value and the layer stays on top.
- **Rollback.** On failure (after the retries, on an abort, or when the commit is refused with `RIVA_CACHE`) the layers are dropped and readers go back to the value below. Nothing else runs: no `updates`, no `invalidates`. A throwing `invalidates` function counts as a failure.
- **Success.** In one batch: the result is committed through `cache`, the layers are dropped, `updates` writes the committed data, then `invalidates` runs. If `updates` throws, the server result stays committed, the layers are dropped, the invalidations still run, and `run` rejects with the thrown error.
- **Order.** Mutations on one riva resolve in start order. If B (started after A) succeeds first, its layer stays visible and its commit waits until A settles. If A fails, A's layer is dropped at once and B's still applies. Clients never share the order.
- **Abort.** `signal` aborts with `RivaAbortError` and rolls back, also while the mutation waits for an earlier one.
- **Server.** `run` works in a React Router action: layers are applied there too but nobody observes them.

## Traps

- `optimistic` returning data only reaches the entities when `cache` has a `layer` method; without `cache`, write with `tx.set`.
- `tx.set` targets one entry: use the variables the reader uses.
- A data value that is itself a function is taken as an updater.
- After success the layer is dropped: without `updates`, `invalidates` or `cache`, nothing replaces it. Only observed queries refetch at once.
- A mutation that succeeded waits for earlier ones: an earlier `run` that never resolves holds it back, so pass a `signal` and abort it.

Exported types: `Mutation`, `MutationOptions`, `RunOptions`, `Tx`, `Invalidation`, `Target`.
