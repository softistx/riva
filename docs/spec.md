# riva — specification (v1)

riva is the organisation's state and data layer: **one API for local state,
server state (GraphQL and REST), cache and mutations**, with SSR as a native
mode and React Router / `@softistx/alxia-react-router` as first-class hosts.
The goal is ultra DX: one mental model, typed end to end, no hand-written keys,
no glue code between three libraries.

Decided with the owner on 2026-11-23 (grilling session). Each decision below is
binding until the owner changes it.

## 1. Decisions

| # | Decision |
|---|----------|
| D1 | **Why**: one unified API for local + server state, native SSR, first-class React Router and alxia-react-router integration. |
| D2 | **Own engine**, small, zero runtime dependencies in the core. No TanStack, no Zustand underneath. |
| D3 | **Framework-agnostic core + React adapter** in v1. Other adapters later, on demand. |
| D4 | **Both targets**: BFF apps (browser never calls the API) and direct clients (SPA, Shadow-DOM widget, mobile web). Same API in both. |
| D5 | `@softistx/graphql-client` and `httpyz` become **transports**. graphql-client's `normalizedCache` and `./react` move into riva, then are deprecated in graphql-client. |
| D6 | Repository `softistx/riva`, library monorepo (`packages/*`, `plugins/riva`). |
| D7 | **Fine-grained signals**: signals and computeds with automatic dependency tracking (owner, 2026-11-24: renamed from atom); React binds through `useSyncExternalStore`. |
| D8 | **Cache**: normalized for GraphQL by default (`__typename` + `id`, overridable key fields); keyed by request for REST, with entities declarable to normalize REST too. |
| D9 | **BFF client data path**: one generic resource route (`/_data`) in `riva-react-router` executes, on the server, the persisted operations of a codegen allowlist with the session caller. The browser sends an operation id and variables only. |
| D10 | **Definitions first**: `query(DOC, opts)` / `mutation(DOC, opts)` are typed objects reused by loaders, hooks, prefetch and invalidation. Keys are derived, never written by hand. |
| D11 | v1 features beyond the base: **optimistic updates with rollback**, **cursor pagination and infinite lists**. |
| D12 | **One `Riva` per request** on the server, one in the browser. Definitions are stateless; values live in a `Riva`. Reading a value with no `Riva` in scope on the server throws. (Renamed from `RivaClient` by the owner on 2026-11-25: the instance holds local state too, so it is not a client.) |
| D13 | **Mutations in a BFF** go through `/_data` (allowlisted, same-origin JSON, session). React Router actions stay for forms, with a helper that writes their result into the cache. |
| D14 | **REST typed by OpenAPI** through `openapi-httpyz`; a free-fetcher mode for schema-less APIs. |
| D15 | **Pilot: one of our BFF apps.** Subscriptions and SSE in v1.1, devtools in v1.2, persistence/offline in v2. |
| D16 | Stores (owner, 2026-11-24; validated 2026-11-25): `store({ name, ssr?, state, computed, actions })` from `@softistx/riva/store` groups a domain's state, computeds and actions. Each state key is a signal named `<name>.<key>` and each computed is a riva computed: both are read as definitions. Only actions write, by top-level assignment on `s`, batched; writes elsewhere throw RIVA_STORE, except `hydrate` and `reset()`. Actions get `(s, ...args, { riva, fetch, mutate })`, and `s` stays bound to its riva across `await`. `ssr: true` makes every key travel. One instance per riva. React: `useStore(def)` gives `[s, a]`, tracked per key. Deep signals and store families come later. |
| D17 | **Draft, for the owner's review in the PR.** Simple API (owner, 2026-11-25): `createRiva({ graphql: graphql(gql), rest: rest(api), defaults })` installs adapter extensions; the core sees only `{ install(riva) }` objects and never imports an adapter. Server state is reached through namespaces: `riva.graphql.query/mutate/subscribe` and `riva.rest.get/post/put/patch/delete`, each returning `Promise<data>` that throws, with cache, dedupe and derived keys (operation name + variables; method + path + input). Per-call options are a third argument (`staleTime`, `invalidates`). Local state stays on the root (`riva.get/set/subscribe`). Definitions (`query()`/`mutation()`) and `ensure` stay for shared settings. React hooks per namespace: `useGraphQL*`, `useRest*`. |

## 2. Packages

| Package | Role | Depends on |
|---------|------|------------|
| `@softistx/riva` | Core: signals, `Riva`, query/mutation engine, normalized + keyed cache, pagination, optimistic layer, dehydrate/hydrate. Pure TS, no DOM, no React. | nothing |
| `@softistx/riva-react` | `RivaProvider`, hooks, Suspense support. | peer `react`, `@softistx/riva` |
| `@softistx/riva-graphql` | GraphQL transport over `@softistx/graphql-client`, `TypedDocumentNode` / persisted ids, codegen plugin emitting the allowlist manifest. | peers `@softistx/riva`, `@softistx/graphql-client` |
| `@softistx/riva-rest` | REST transport over `openapi-httpyz` + free fetcher. | peers `@softistx/riva`, `httpyz`/`openapi-httpyz` |
| `@softistx/riva-react-router` | Per-request riva, dehydrate into the loader payload / hydrate on the client, the `/_data` route, action-result helper, revalidation bridge, alxia-react-router integration. | peers `@softistx/riva`, `@softistx/riva-react`, `react-router`, `@softistx/alxia-react-router` (optional) |

Adapters reach what they wrap **as peers, by range**; the core never imports
an adapter. A class (`RivaError`…) is defined once in the core and thrown by
the adapters, so `instanceof` holds.

## 3. API sketch (target DX)

```ts
// Local state — definitions, no value until a riva reads them
import { signal, computed } from "@softistx/riva";

export const filter = signal("");
export const sidebarOpen = signal(true, { persist: false });
export const hasFilter = computed((get) => get(filter).length > 0);

// Domain store — state, computeds and actions in one definition (D16)
import { store } from "@softistx/riva/store";

export const BookStore = store({
  name: "books",
  ssr: true,
  state: { items: [] as Book[], filter: "" },
  computed: { total: (s) => s.items.length },
  actions: { add(s, book: Book) { s.items = [...s.items, book]; } },
});
BookStore.total.get(); // a definition, read like any signal
BookStore.add(book); // only actions write; const [s, a] = useStore(BookStore) in React

// GraphQL
import { query, mutation, infinite } from "@softistx/riva-graphql";

export const patients = query(PATIENTS_QUERY, { staleTime: "30s" });
export const patientsFeed = infinite(PATIENTS_QUERY, { connection: (d) => d.patients });
export const renamePatient = mutation(RENAME_PATIENT_MUTATION, {
  optimistic: ({ id, name }) => ({ renamePatient: { __typename: "Patient", id, name } }),
});

// REST (OpenAPI)
import { rest } from "@softistx/riva-rest";
export const invoice = rest.query(api.get("/invoices/{id}"));

// React Router loader (server, per-request riva injected by riva-react-router)
export async function loader({ context, params }: Route.LoaderArgs) {
  await patients.ensure(context, { school: params.slug });
  return riva(context); // dehydrated cache travels with the payload
}

// Component (client) — same definition, typed vars and data
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

Rules of the API:
- Every definition is typed from its document or OpenAPI operation; variables
  and data are inferred, never annotated by the user.
- Keys derive from (definition id, stable-serialized variables).
- Durations accept numbers (ms) or strings (`"30s"`, `"5m"`).
- One status model everywhere: `idle | pending | success | error`, plus
  `isFetching` for background refetches; errors are `RivaError` subclasses
  carrying the transport's code (GraphQL error code, HTTP status).
- No hook is required to read state: `riva.get(def, vars)` and
  `riva.subscribe(...)` work outside React (widgets, tests, workers).

## 4. Core behaviour

### 4.1 Signals
- `signal(initial, opts)`, `computed(fn)`, `effect(fn)` (client-only), `batch(fn)`,
  `untracked(fn)`. Glitch-free, lazy computeds, synchronous propagation.
- Values are stored per `Riva` (D12). A server-side read with no `Riva` in
  scope throws `RivaScopeError` with a message naming the fix.
- D16: a store's state keys are signals whose
  `equals` refuses any write made outside an action or `reset()` with
  `RIVA_STORE`; hydration seeds values and never writes.

### 4.2 Query engine
- Dedupe of identical in-flight requests; `staleTime`, `gcTime`, `retry`
  (exponential backoff, transport-aware: no retry on 4xx / validation codes),
  refetch on focus/reconnect (browser only, opt-out), polling (`refetchEvery`).
- `ensure` (fetch if missing or stale, await), `prefetch` (fire and forget),
  `invalidate` (by definition, by definition + vars, by entity), `setData`.
- Cancellation through `AbortSignal` end to end.

### 4.3 Cache
- GraphQL: normalized store of entities keyed by `__typename:id` (key fields
  overridable per type), query roots referencing entities, fragment read/write,
  reference-counted garbage collection after `gcTime`.
- REST: entries keyed by request; `entities: { Invoice: (r) => r.id }` opt-in
  normalizes REST responses into the same store.
- Taken over from graphql-client's `normalizedCache` (D5): port its tests first.

### 4.4 Mutations and optimistic layer
- Optimistic writes go to a layer above the committed cache; on failure the
  layer is dropped (rollback), on success the server result replaces it.
- `onSuccess` helpers: `invalidates: [patients]`, `updates: (cache, data) => …`.
- Concurrent optimistic mutations on one entity resolve in order.

### 4.5 Pagination
- `infinite(def, { connection })` for cursor connections (alxia's
  `edges/pageInfo` shape built in), `fetchNext`, `fetchPrevious`, `hasNext`,
  merge into the normalized cache, refetch of all loaded pages.

### 4.6 SSR
- `dehydrate(riva)` → serializable snapshot (cache + signals marked
  `ssr: true`); `hydrate(riva, snapshot)` on the browser, before first
  render. Errors are dehydrated as codes, never stack traces.
- Hydration never refetches data still fresh at hydration time.

## 5. BFF integration (`riva-react-router`)

- A middleware creates one `Riva` per request and puts it in the
  router context (alxia's context when alxia-react-router is the host).
- The loader payload carries the dehydrated snapshot; `RivaRouterProvider`
  hydrates it, and on navigation merges each new loader's snapshot.
- `/_data` resource route (D9, D13):
  - accepts `POST` same-origin JSON `{ id, variables }` only; refuses
    otherwise (Origin check, content type);
  - looks `id` up in the **allowlist manifest** emitted by `riva-graphql`'s
    codegen plugin; unknown id → 404, never executes free documents;
  - executes with the session caller of the app (an injected `caller(request)`
    port, the same one the loaders use), so the API's guards apply;
  - forwards the API's error codes untouched for the client to word.
- Client-side queries and mutations in a BFF go through a transport that
  posts to `/_data`; in a direct client they go to the API.
- `useActionResult(action, { into: def })` writes a form action's result into
  the cache; `revalidate` bridges riva invalidation and React Router
  revalidation in both directions.

## 6. Quality bar

- Core gzipped size budget: **≤ 6 kB** (`riva` + `riva-react` ≤ 9 kB), checked
  in `verify`.
- Type inference checked by type tests (`expectTypeOf`), counted like janus's
  type counts.
- Every behaviour above has a spec beside its source; SSR and `/_data` have
  integration specs on a real React Router app fixture.
- `bun check` for typechecking, Biome for lint/format, changesets for releases,
  `publish.yml` to npmjs only.

## 7. Out of v1

- v1.1: subscriptions (graphql-client's), SSE / streamed events (an assistant chat as the case).
- v1.2: devtools panel (cache, signals, requests).
- v2: persistence (IndexedDB) and offline mutation queue.
- Other framework adapters: on demand.

## 8. Plan (v1 slices)

Integration branch `feat/v1` off `develop`; one PR per slice into it; one PR
`feat/v1` → `develop` at the end (base:large-feature-branch-workflow).

1. Skeleton (this PR): monorepo, five empty packages that build, green bar, docs.
2. Core signals + `Riva` scoping + SSR guard.
3. Query engine (dedupe, stale/gc, retry, ensure/prefetch/invalidate, abort).
4. Normalized cache + keyed REST cache (port graphql-client's normalizedCache tests).
5. Mutations + optimistic layer with rollback.
6. Cursor pagination + infinite lists.
7. `riva-react`: provider, hooks, Suspense.
8. `riva-graphql`: graphql-client transport, persisted ids, allowlist codegen plugin.
9. `riva-rest`: openapi-httpyz transport + free fetcher.
10. `riva-react-router`: per-request riva, dehydrate/hydrate, `/_data`, action helper, revalidation bridge.
11. Docs and `plugins/riva` (use-riva skill, references/packages.md, riva-upgrade-assistant).
12. graphql-client: deprecate `normalizedCache` and `./react` in favour of riva (graphql repo).
13. Pilot: a BFF app adopts riva in place of its hand-made fetch/useFetcher/polling.
