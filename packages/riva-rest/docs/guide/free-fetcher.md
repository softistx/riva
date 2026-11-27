# Free fetcher

> Most call sites use the [simple API](./simple-api.md). This page covers the definition, for settings several call sites share: see [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md).

## What it is for

For an API with no schema, write the function: its types are the definition's types.

## Define and run

```ts
import { mutation, query } from '@softistx/riva-rest';

type Todo = { id: string; title: string; done: boolean };

export const todos = query({
	id: 'todos',
	fetch: async (vars: { done?: boolean }, { http, signal }) => {
		const reply = await http.get('/todos', { query: vars, signal });
		return reply.data as Todo[];
	},
});

export const renameTodo = mutation({
	id: 'renameTodo',
	mutate: async (vars: { id: string; title: string }, { http, signal }) =>
		(await http.patch('/todos/{id}', { param: { id: vars.id }, json: { title: vars.title }, signal })).data as Todo,
});
```

## Options

`FreeQueryOptions` and `FreeMutationOptions` are the core's query and mutation options, with the fetcher:

| Option | Default | Meaning |
|---|---|---|
| `id` | required | A function has no name to derive a key from. |
| `fetch(vars, ctx)` (query) | required | Returns the data. |
| `mutate(vars, ctx)` (mutation) | required | Sends the change, returns the data. |
| the others | core defaults | `staleTime`, `gcTime`, `retry`, `cache`, `optimistic`, `invalidates`… |

The context is the core's (`signal`, `riva`) plus `http`, the httpyz client of the transport.

## Traps

- `http` is read lazily: a fetcher that never touches it (a plain `fetch`) needs no transport.
- Without `id`, the definition throws `riva-rest: query() needs an id`.
- What the fetcher throws from httpyz is mapped to riva's errors ([errors](./errors.md)).
- Free fetchers are server-only under [BFF mode](./bff.md): `http` does not exist in the browser.
