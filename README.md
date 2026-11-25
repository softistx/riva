# riva

The state and data layer of the softistx stack: one API for local state, server
state (GraphQL and REST), cache and mutations, with native SSR and React Router
as a first-class host. Small zero-dependency core, typed end to end, no
hand-written keys.

## API sketch

```ts
// One riva per request on the server, one in the browser.
// Schematic names: PATIENTS_QUERY and the other documents, Invoice, Route
import { createGraphQLClient } from "@softistx/graphql-client";
import { createRiva, signal } from "@softistx/riva";
import { graphql } from "@softistx/riva-graphql";
import { rest } from "@softistx/riva-rest";

export const appRiva = createRiva({
  graphql: graphql(createGraphQLClient({ url: "https://api.example.com/graphql" })),
  rest: rest({ baseUrl: "https://api.example.com" }), // or rest(openApiClient), typed
  defaults: { staleTime: "30s" },
});

// Local state: no value until a riva reads it
export const filter = signal("");

// Server state: call it like a function, no definition, no key
const patients = await appRiva.graphql.query(PATIENTS_QUERY, { school: "north" }); // data, or throws
const live = appRiva.graphql.query(PATIENTS_QUERY, { school: "north" }); // the same call, as a resource
await appRiva.graphql.mutate(RENAME_PATIENT_MUTATION, { id: "1", name: "Ana" }, { invalidates: [PATIENTS_QUERY] });
const invoice = await appRiva.rest.get<Invoice>("/invoices/42");

// React Router loader: await what the page needs, the cache travels with the payload
export async function loader({ context, params }: Route.LoaderArgs) {
  await rivaOf(context).graphql.query(PATIENTS_QUERY, { school: params.school });
  return riva(context);
}

// Component: the same call, as a hook
function PatientList({ school }: { school: string }) {
  const patients = useGraphQL(PATIENTS_QUERY, { school });
  const rename = useGraphQLMutation(RENAME_PATIENT_MUTATION);
  if (patients.status !== "success") return null;
  return patients.data.patients.map((p) => <button key={p.id} onClick={() => rename({ id: p.id, name: "Ana" })}>{p.name}</button>);
}
```

`query()`, `mutation()` and `infinite()` definitions stay for what several call
sites share (polling, optimistic updates, cursor pagination): see
[shared definitions](./packages/riva/docs/guide/shared-definitions.md).

## Packages

| Package | Role |
|---------|------|
| `@softistx/riva` | Core: `createRiva`, signals, resources, the query and mutation engine, cache, pagination, optimistic layer, dehydrate and hydrate |
| `@softistx/riva-react` | `RivaProvider`, `useRiva`, resource hooks, hooks over definitions, Suspense support |
| `@softistx/riva-graphql` | `riva.graphql` over `@softistx/graphql-client`, `useGraphQL` hooks, persisted ids, allowlist codegen |
| `@softistx/riva-rest` | `riva.rest` over `openapi-httpyz` or a plain base URL, `useRest` hooks |
| `@softistx/riva-react-router` | Per-request riva, ambient scope, SSR hydration and navigation merge, `/_data` route |

## Status

v1 in progress. See [docs/roadmap.md](./docs/roadmap.md) and the decision
record [docs/spec.md](./docs/spec.md).
