---
name: use-riva
description: >-
  Wire and use @softistx/riva and its adapters in an application: pick the
  package and subpath by need (the simple API riva.graphql and riva.rest,
  their React hooks, signals, stores, SSR, React Router, shared definitions
  for polling, optimistic updates and infinite lists), install the right
  peers, and respect the invariants (one Riva per request, derived keys,
  errors defined in the core, the SSR scope guard). This is the index: the
  packages ship the detail. Use when an app depends on any @softistx/riva*
  package; when it reads GraphQL or REST data, adds a mutation, an
  optimistic update, a store, a /_data route or SSR hydration; or when an
  error mentions riva, RivaError, RIVA_SCOPE or RIVA_CACHE.
---

# Skill: Use the riva packages

This skill is the index: which package, which peers, which invariants, which
traps. The detail lives in what each package ships, and **the installed copy
is the one that matches the app's version**. Read it there, never from memory.

```
node_modules/@softistx/<pkg>/README.md                    one concise example per area: read before writing code
node_modules/@softistx/<pkg>/docs/README.md               every guide page, and when to read it
node_modules/@softistx/<pkg>/docs/guide/                  one page per area, every option with an example
node_modules/@softistx/<pkg>/docs/troubleshooting.md      every error, by the message you see
node_modules/@softistx/<pkg>/docs/roadmap.md              what is next, what is not planned (when shipped)
```

In a monorepo the packages may sit in a parent's `node_modules`: look up the
tree. `references/packages.md` (generated) lists every package with its entry
points, peers and the exact docs pages it ships. The tarball carries no
`CHANGELOG.md`: version history is the `riva-upgrade-assistant` agent's job.

## 1. Choose the package by need

Install the core and one package per need. Every adapter peers
`@softistx/riva`. Start from the simple API: `createRiva({ graphql, rest })`,
then `riva.graphql.query(DOC, vars)` and `riva.rest.get(path, input)`.

| Need | Package and subpath |
| --- | --- |
| `createRiva`, signals, computeds, effects, errors | `@softistx/riva` |
| GraphQL as calls: `riva.graphql.query / mutate / mutation / subscribe` | `@softistx/riva-graphql` (`graphql(client)`) |
| REST as calls: `riva.rest.get / mutation / post / put / patch / delete` | `@softistx/riva-rest` (`rest(api)` or `rest({ baseUrl })`) |
| The calls as hooks in components | `@softistx/riva-graphql/react` (`useGraphQL`), `@softistx/riva-rest/react` (`useRest`), over `@softistx/riva-react` |
| A reactive, awaitable resource of your own (a hook over it) | `@softistx/riva/resource`, `@softistx/riva-react/resource` |
| React: provider, `useRiva`, signals | `@softistx/riva-react` |
| React Router 8: one riva per request, SSR hydration, `/_data`, revalidation | `@softistx/riva-react-router` (`/server`) |
| Dehydrate on the server, hydrate in the browser, an ambient scope resolver | `@softistx/riva/ssr` |
| A domain's state, computeds and actions | `@softistx/riva/store` |
| The adapter's entity cache (one copy per entity) | `graphql(client, { cache: normalized() })` from `@softistx/riva-graphql/cache`; `rest(api, { cache: restEntities(...) })` from `@softistx/riva-rest/entities` |
| GraphQL allowlist for a BFF (codegen, server source, browser transport) | `@softistx/riva-graphql/codegen`, `/server`, `/bff` |
| REST through a BFF | `@softistx/riva-rest/server`, `/bff` |
| Polling, `gcTime`, optimistic updates, cursor pagination, one setting shared by call sites | definitions: `query()`, `mutation()`, `infinite()`, `useQuery`, `useMutation`, `useInfiniteQuery` |

The peers each package adds, with their ranges, are in
`references/packages.md` and in each README's install section.

## 2. The wiring path

1. Read `node_modules/@softistx/riva/README.md` (its quick start), then the
   README of each adapter the app needs.
2. Create one `Riva` with its extensions: `createRiva({ graphql:
   graphql(client), rest: rest(api), defaults: { staleTime: '30s' } })`. One
   in the browser, **one per request on the server**. The extension installs
   the transport: no `provideGraphQL` or `provideRest` call.
3. Call it: `await riva.graphql.query(DOC, vars)` for the data, the same call
   without `await` for a reactive resource, `riva.graphql.mutate(DOC, vars,
   { invalidates: [PATIENTS_QUERY] })` for a write, `riva.rest.get(path, input)`
   for REST. In components use `useGraphQL`, `useGraphQLMutation`,
   `useRest`.
4. In a React Router 8 app, add `rivaMiddleware({ create })` on the root
   route and `RivaRouterProvider riva={...}` in the root component; loaders
   `await riva.graphql.query(...)` or `riva.rest.get(...)` and return
   `riva(context)`. Type `rivaOf` once with `declare module '@softistx/riva-react-router' { interface Register { riva: AppRiva } }`.
5. Reach for a definition (`docs/guide/shared-definitions.md` of
   `@softistx/riva`) only when a call site needs what the simple API does
   not give: polling, optimistic updates, infinite lists, a shared setting.
6. Add the optional parts one at a time (entities, store, BFF), each from its
   guide, and run the app's typecheck after each.
7. Run the specs of what changed, with the tools of the app's own `package.json`.

## 3. The invariants an app respects

- **Definitions are stateless, values live per `Riva`.** No module-level
  riva on the server: a read with no riva in scope throws `RIVA_SCOPE`
  (the SSR leak guard). Fix it with `riva.get(def)`, `riva.run(...)` or the
  host's middleware, never by sharing a riva between requests.
- **Keys are derived**: the definition's `id` plus the stable-serialized
  variables. Never write a key by hand; two definitions must not share an `id`.
- **Errors are defined once, in the core** (`RivaError`, `RivaRequestError`,
  `RivaHttpError`, `RivaNetworkError`, `RivaAbortError`, `RivaScopeError`) and
  thrown by the adapters, so `instanceof` holds. Import them from
  `@softistx/riva`, never from an adapter. One copy of `@softistx/riva` in the
  tree, or `instanceof` fails.
- **A snapshot is opaque**: pass on what `dehydrate` returned, never build or
  edit one. Escape `<` when inlining it in a `<script>`.
- **Only a store's actions write its state**, by top-level assignment of
  immutable values.
- **The browser never sends a document to a BFF**: it posts an id the server's
  allowlist knows.

## 4. Traps

- `staleTime` defaults to 0: data a loader awaited is refetched at once in the
  browser unless the riva has `defaults: { staleTime }` (or the call a
  `staleTime`).
- A document passed to the simple API and a definition are separate cache
  entries: a loader and its component use the same kind
  (`riva.graphql.query(DOC)` with `useGraphQL(DOC)`, `def.ensure` with
  `useQuery(def)`), or pass the definition to the simple API
  (`riva.graphql.query(def, vars)`, `useGraphQL(def, vars)`,
  `riva.rest.get(def, input)`, `useRest(def, input)`) so both share one
  entry. A mutation's `invalidates` names the kind it means (`[DOC]` or `[def]`).
- `rivaOf(context)` returns the base `Riva`: cast it once to the app's riva
  type to get `riva.graphql` typed.
- Name GraphQL documents as SCREAMING_SNAKE constants with their kind as a
  suffix (`PATIENTS_QUERY`, `RENAME_PATIENT_MUTATION`).
- A mutation definition without `updates`, `invalidates` or `cache` leaves
  nothing in place of its optimistic layer after success.
- A GraphQL document with `normalized()` must select `__typename` below the
  root (the client preset's `addTypenameSelectionDocumentTransform` adds it).
- Two `entities()` or `restEntities()` calls with other identity rules on one
  riva throw `RIVA_CACHE`: share one policy object.
- `rivaMiddleware` goes on the root route once; `riva(context)` is returned
  from one loader per request.
- Free REST fetchers run on the server only; with `bffTransport` they throw.

The full Traps of each package are in its README and `docs/troubleshooting.md`:

- [riva](https://github.com/softistx/riva/blob/develop/packages/riva/docs/troubleshooting.md)
- [riva-react](https://github.com/softistx/riva/blob/develop/packages/riva-react/docs/troubleshooting.md)
- [riva-graphql](https://github.com/softistx/riva/blob/develop/packages/riva-graphql/docs/troubleshooting.md)
- [riva-rest](https://github.com/softistx/riva/blob/develop/packages/riva-rest/docs/troubleshooting.md)
- [riva-react-router](https://github.com/softistx/riva/blob/develop/packages/riva-react-router/docs/troubleshooting.md)

In the app, the same text is `node_modules/@softistx/<pkg>/docs/troubleshooting.md`.

## 5. When the docs and the code disagree

The installed README and `docs/troubleshooting.md` win over this skill. Search
`troubleshooting.md` of the package for the exact message first. A bug, a
missing feature or a wrong doc in a riva package is an issue on the
`softistx/riva` repository, never a workaround built on parsing an error
message.
