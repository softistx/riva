# Stores: `@softistx/riva-react/store`

`useStore(def)` binds a store built with `store()` from `@softistx/riva/store`. It returns `[s, a]`: `s` is the state and the computeds, `a` the actions bound to the provider's client (stable for that client).

```tsx
import { useStore } from '@softistx/riva-react/store';

function Books() {
	const [s, a] = useStore(BookStore);
	return (
		<>
			<input value={s.filter} onChange={(e) => a.filterBy(e.target.value)} />
			<p>{s.total} books</p>
			<ul>{s.visible.map((b) => <li key={b.title}>{b.title}</li>)}</ul>
			<button onClick={() => a.add({ title: 'New' })}>Add</button>
		</>
	);
}
```

- `s` is tracked per key: the component re-renders only when a key it read during its render changes. `s.total` alone does not re-render on a `filter` change.
- `s` is read-only: a write throws a `RivaError` with code `RIVA_STORE` (``Store "books": "filter" is read-only here; write it in an action.``). Write through `a`.
- `s` is a new object after each change of a key the component read, so `useMemo(…, [s])` and `React.memo` children that take `s` follow it.
- `useValue(BookStore.total)` still reads a single value.
- Under `renderToString` the hook reads the provider's client.

Defining a store, the action context and names: the core's [store guide](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/store.md).
