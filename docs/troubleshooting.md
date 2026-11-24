# Troubleshooting

## `RIVA_CACHE`: Cannot cache the data

A mutation's `optimistic` data or its server result holds something the entity cache cannot store (a function, a class instance other than `Date`, a bigint, a cycle).

- `optimistic` throws before anything is shown: `run` rejects and no layer is left.
- The server result is refused at commit: the layers are rolled back, `updates` and `invalidates` do not run, and `run` rejects with the error.

Return JSON-like data (a `Date` is allowed), or map the result before returning it from `run`.

## An optimistic write does not show

- `optimistic` returning data only reaches the entities when the mutation has `cache: entities()`. Without it, write with `tx.set(query, vars, dataOrUpdater)`.
- `tx.set` targets one entry: the variables must be the ones the reader uses (`stableKey(id, vars)`).
- A data value that is itself a function is taken as an updater.

## A mutation never settles

Mutations on one client settle in start order: a mutation that succeeded waits for the earlier ones. An earlier mutation whose `run` never resolves holds the later ones back; pass a `signal` and abort it.

## The list shows the old value after success

On success the optimistic layer is dropped. Without `updates` or `cache`, nothing replaces it: add `updates` to write the result, or `invalidates` to refetch the query (only observed queries refetch at once).
