# The provider and the riva

One `Riva` per tree: one in the browser, one per request on the server. `RivaProvider` puts it in scope for the hooks below it.

```tsx
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva } from '@softistx/riva';
import { withGraphQL } from '@softistx/riva-graphql';
import { RivaProvider, useRiva } from '@softistx/riva-react';
import { PATIENTS_QUERY, RENAME_PATIENT_MUTATION } from './graphql'; // typed documents

const riva = createRiva({
	graphql: withGraphQL(createGraphQLClient({ url: 'https://api.example.com/graphql' })), // per request on the server
	defaults: { staleTime: '30s' },
});

export const App = () => (
	<RivaProvider riva={riva}>
		<Patients />
	</RivaProvider>
);

function RenameButton() {
	const riva = useRiva();
	const rename = () =>
		riva.graphql.mutate(RENAME_PATIENT_MUTATION, { id: '1', name: 'Ana' }, { invalidates: [PATIENTS_QUERY] });
	return <button onClick={rename}>Rename</button>;
}
```

| Export | What |
| --- | --- |
| `RivaProvider` | Props: `riva` (required) and `children`. |
| `useRiva()` | The nearest provider's riva. Use it to call `riva.graphql` or `riva.rest` from an event handler, or `def.invalidate(riva, vars)`, `def.ensure(riva, vars)` or `def.setData(...)` on a definition. |

Every hook binds through `useSyncExternalStore`, so it is concurrent-safe and renders on the server.

## Traps

- A hook with no provider above it throws `RivaScopeError` (`RIVA_SCOPE`: ``No Riva in scope: wrap the tree in <RivaProvider riva={riva}>``).
- Create the riva once per mount in the browser (outside the component or in a `useState` initializer), not on each render. With React Router, `RivaRouterProvider` takes the riva (`riva` prop) and hydrates the loaders' data into it.
- On the server never keep a riva at module level: build one per request.
