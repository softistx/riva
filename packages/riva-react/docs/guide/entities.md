# Entities: `@softistx/riva-react/entities`

> Most call sites read GraphQL or REST with the hooks of the adapters (`useGraphQL`, `useRest`: see the [resource hooks](./resource.md)). This page covers the hook over a definition, for settings several call sites share: see [Advanced: shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md).

`useFragment` reads one entity of the normalized cache (`@softistx/riva/entities`) by its ref (`Type:id`). The component re-renders when that entity's fields change, and only then.

```tsx
import { useFragment } from '@softistx/riva-react/entities';

function PatientName({ id }: { id: string }) {
	const patient = useFragment<{ name: string }>(`Patient:${id}`);
	return <span>{patient?.name ?? '…'}</span>;
}
```

`useFragment<T>(ref)`:

| Argument | Meaning |
| --- | --- |
| `T` | The entity's type; default `Record<string, unknown>`. |
| `ref` | `'Type:id'`, or `null` / `undefined`: the hook then reads `undefined`, as it does for a missing entity. |

- It reads the committed entity with optimistic layers applied.
- The queries that fill the cache need `cache: entities()` (or `normalized()` from `@softistx/riva-graphql/cache`); without a cache policy, there is nothing to read.
- A missing entity reads `undefined`, never throws.

Identity rules and the store: the core's [entities guide](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/entities.md).
