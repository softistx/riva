# Resources

`@softistx/riva/resource` gives reactive, awaitable views of server state: a resource over a query, a handle over a mutation and a resource over a stream.

```ts
import { mutationHandle, resource, streamResource } from '@softistx/riva/resource';
```

## `resource(riva, source, opts?)`

```ts
const page = signal(1);
const books = resource(
	riva,
	() => [booksQuery, { page: riva.get(page) }] as const,
	{ enabled: () => riva.get(signedIn), keepPrevious: true, staleTime: '30s' },
);

books.state; // { status, data, error, isFetching, placeholder }
const stop = books.subscribe((state) => render(state));
const list = await books; // one-shot load
```

- `source` returns `[definition, variables]` and runs in a tracked computed. When what it reads changes, the key is derived again, the new entry is observed and the old one released.
- `enabled` is a boolean or a tracked function (default true). While false the state is `{ status: 'idle' }`, `source` is **not** called and nothing is fetched.
- `keepPrevious` (default true): while the new key has no data, the state is `success` with the previous key's data, `placeholder: true` and `isFetching: true`. With `false` it is `loading`.
- `staleTime` replaces the definition's for this resource.

### The state

`ResourceState<D>` is a union on `status`:

| `status` | `data` | Also |
| --- | --- | --- |
| `idle` | `undefined` | disabled |
| `loading` | `D \| undefined` | `isFetching` |
| `success` | `D` | `isFetching` (background refetch), `placeholder` |
| `error` | `D \| undefined` (the last data) | `error` |

```ts
const s = books.state;
if (s.status === 'success') s.data; // typed, never undefined
```

### Reactive and lazy

`state` is readable in a computed or effect (it is tracked), and `subscribe(listener)` returns the unsubscribe. A resource is lazy: it observes its entry (fetch, polling, refetch on focus) from its first subscriber, or its first observed computed or effect reader, to its last, and only in a browser. A plain read of `state` starts nothing. A computed reader that is dropped without a change is noticed at the entry's next update; unsubscribing stops at once.

**Known limitation:** a dropped computed or effect reader is noticed only at the entry's next state change. An entry with no polling and no refetch on focus has no such change, so it stays observed and is never garbage-collected. Create resources outside render (once, at module or app level), or `subscribe` explicitly and call the unsubscribe when done.

### Awaiting

`await books` is a one-shot load through the definition's `ensure` with the current variables (fresh data resolves without fetching). It rejects with the error, and with a `RivaError` `RIVA_DEFINITION` while the resource is disabled. It is the way to load on a server, where nothing is observed; the state then reads the filled cache. A resource is a thenable: do not return it from an `async` function unless you mean to await it.

## `mutationHandle(riva, run)`

```ts
import type { RunOptions } from '@softistx/riva';

const save = mutationHandle(riva, (vars: { id: string }, opts?: RunOptions) => saveBook(vars, opts));

save.state; // idle first
await save({ id: '1' }); // loading, then success or error; rejects with the error
save.reset(); // back to idle
```

Calls may overlap: each resolves with its own result and the state follows the last call. `reset()` also ignores a call still running.

## `streamResource(riva, source, opts?)`

```ts
const feed = streamResource(
	riva,
	() => {
		const id = riva.get(roomId);
		return (signal) => subscribeToRoom(id, signal); // an AsyncIterable
	},
	{ next: (m) => log(m), error: (e) => report(e), complete: () => {} },
);
```

The state is `loading` until the first value, then `success` with the last one (`isFetching` while the stream is open), then `error` (the last value kept) if it fails; a stream that ends with no value is `idle`. It restarts when `source` returns a new factory (that is, when what it reads changes), starts at the first reader and, at the last, aborts the signal and calls the iterator's `return()`. A callback that throws is raised outside the stream (never reported to `error`), and a throwing `next` ends the stream. `enabled` works as in `resource`.

Stream semantics:

- A restart resets the state to `loading` and drops the previous value (there is no `keepPrevious` for streams).
- An errored or completed stream stays terminal until `source` returns a new factory or the resource is subscribed again after its last unsubscribe.
- On a server a `streamResource` stays `loading`: it is one-shot and never observed.

Problems: [troubleshooting](../troubleshooting.md).
