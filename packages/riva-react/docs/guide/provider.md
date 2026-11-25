# The provider and the riva

One `Riva` per tree: one in the browser, one per request on the server. `RivaProvider` puts it in scope for the hooks below it.

```tsx
import { createRiva } from '@softistx/riva';
import { RivaProvider, useRiva } from '@softistx/riva-react';

const riva = createRiva(); // per request on the server

export const App = () => (
	<RivaProvider riva={riva}>
		<Patients />
	</RivaProvider>
);

function RefreshButton() {
	const riva = useRiva();
	return <button onClick={() => patients.invalidate(riva, { school: 'north' })}>Refresh</button>;
}
```

| Export | What |
| --- | --- |
| `RivaProvider` | Props: `riva` (required) and `children`. |
| `useRiva()` | The nearest provider's riva. Use it to call `def.invalidate(riva, vars)`, `def.ensure(riva, vars)` or `def.setData(...)` from an event handler. |

Every hook binds through `useSyncExternalStore`, so it is concurrent-safe and renders on the server.

## Traps

- A hook with no provider above it throws `RivaScopeError` (`RIVA_SCOPE`: ``No Riva in scope: wrap the tree in <RivaProvider riva={riva}>``).
- Create the riva once per mount in the browser (outside the component or in a `useState` initializer), not on each render. With React Router, `RivaRouterProvider` does it for you.
- On the server never keep a riva at module level: build one per request.
