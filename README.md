# riva

The state and data layer of the softistx stack: one API for local state, server
state (GraphQL and REST), cache and mutations, with native SSR and React Router
as a first-class host. Small zero-dependency core, typed end to end, no
hand-written keys.

## API sketch

```ts
// Local state: definitions, no value until a riva reads them
import { signal, computed } from "@softistx/riva";

export const filter = signal("");
export const sidebarOpen = signal(true, { persist: false });
export const hasFilter = computed((get) => get(filter).length > 0);

// GraphQL
import { query, mutation, infinite } from "@softistx/riva-graphql";

export const patients = query(PATIENTS_QUERY, { staleTime: "30s" });
export const patientsFeed = infinite(PATIENTS_QUERY, { connection: (d) => d.patients });
export const renamePatient = mutation(RENAME_PATIENT_MUTATION, {
  optimistic: ({ id, name }) => ({ renamePatient: { __typename: "Patient", id, name } }),
});

// REST (OpenAPI)
import { rest } from "@softistx/riva-rest";
export const invoice = rest.query(api, "get /invoices/{id}");

// React Router loader
export async function loader({ context, params }: Route.LoaderArgs) {
  await patients.ensure(context, { school: params.slug });
  return riva(context); // dehydrated cache travels with the payload
}

// Component: same definition, typed vars and data
function PatientList() {
  const [q, setQ] = useSignal(filter);
  const { data, status, refetch } = useQuery(patients, { school, q });
  const rename = useMutation(renamePatient); // optimistic + rollback
  const feed = useInfiniteQuery(patientsFeed, { school });
}

// Outside a component
patients.invalidate(riva, { school });
renamePatient.run(riva, { id, name });
```

## Packages

| Package | Role |
|---------|------|
| `@softistx/riva` | Core: signals, `Riva`, query and mutation engine, cache, pagination, optimistic layer, dehydrate and hydrate |
| `@softistx/riva-react` | `RivaProvider`, hooks, Suspense support |
| `@softistx/riva-graphql` | GraphQL transport over `@softistx/graphql-client`, persisted ids, allowlist codegen |
| `@softistx/riva-rest` | REST transport over `openapi-httpyz`, plus a free fetcher |
| `@softistx/riva-react-router` | Per-request riva, ambient scope, SSR hydration and navigation merge |

## Status

v1 in progress. See [docs/roadmap.md](./docs/roadmap.md) and the decision
record [docs/spec.md](./docs/spec.md).
