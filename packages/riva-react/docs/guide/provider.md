# The provider and the client

One `RivaClient` per tree: one in the browser, one per request on the server. `RivaProvider` puts it in scope for the hooks below it.

```tsx
import { createRivaClient } from '@softistx/riva';
import { RivaProvider, useClient } from '@softistx/riva-react';

const client = createRivaClient(); // per request on the server

export const App = () => (
	<RivaProvider client={client}>
		<Patients />
	</RivaProvider>
);

function RefreshButton() {
	const client = useClient();
	return <button onClick={() => patients.invalidate(client, { school: 'north' })}>Refresh</button>;
}
```

| Export | What |
| --- | --- |
| `RivaProvider` | Props: `client` (required) and `children`. |
| `useClient()` | The nearest provider's client. Use it to call `def.invalidate(client, vars)`, `def.ensure(client, vars)` or `def.setData(...)` from an event handler. |

Every hook binds through `useSyncExternalStore`, so it is concurrent-safe and renders on the server.

## Traps

- A hook with no provider above it throws `RivaScopeError` (`RIVA_SCOPE`: ``No RivaClient in scope: wrap the tree in <RivaProvider client={client}>``).
- Create the client once per mount in the browser (outside the component or in a `useState` initializer), not on each render. With React Router, `RivaRouterProvider` does it for you.
- On the server never keep a client at module level: build one per request.
