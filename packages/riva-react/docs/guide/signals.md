# Signals and computeds: `useSignal`, `useValue`

```tsx
import { computed, signal } from '@softistx/riva';
import { useSignal, useValue } from '@softistx/riva-react';

const filter = signal('');
const hasFilter = computed((get) => get(filter).length > 0);

function Search() {
	const [q, setQ] = useSignal(filter); // setQ takes a value or an updater
	const active = useValue(hasFilter); // a signal or a computed
	return <input value={q} data-active={active} onChange={(e) => setQ(e.target.value)} />;
}
```

| Hook | Takes | Returns |
| --- | --- | --- |
| `useSignal(signal)` | a `Signal<T>` | `[value, set]`; `set` takes a value or `(prev) => next` |
| `useValue(readable)` | a signal or a computed | the current value, read-only |

- The component re-renders when the value changes by the definition's `equals` (default `Object.is`).
- Values are held by the provider's client, so two requests, or two clients in a test, never share one.
- Under `renderToString` the hooks read the provider's client.
- `useValue(Store.key)` reads one value of a store; see [store](./store.md) for `useStore`.

Definitions, options (`name`, `equals`, `ssr`) and effects: the core's [signals guide](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/signals.md).
