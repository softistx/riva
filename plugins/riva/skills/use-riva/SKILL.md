---
name: use-riva
description: >-
  Wire and use @softistx/riva and its adapters in an application: pick the
  package and subpath by need (signals, queries, mutations, the normalized
  cache, infinite lists, stores, SSR, React hooks, a GraphQL or REST
  transport, React Router), install the right peers, and respect the
  invariants (one Riva per request, derived keys, errors defined in the
  core, the SSR scope guard). This is the index: the packages ship the detail.
  Use when an app depends on any @softistx/riva* package; when it adds a
  query, a mutation, an optimistic update, a store, a /_data route or SSR
  hydration; or when an error mentions riva, RivaError, RIVA_SCOPE or
  RIVA_CACHE.
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
`@softistx/riva`.

| Need | Package and subpath |
| --- | --- |
| Signals, computeds, effects, `Riva`, `query`, `mutation` | `@softistx/riva` |
| A normalized cache shared by queries (one copy per entity) | `@softistx/riva/entities` |
| Cursor pagination, infinite lists | `@softistx/riva/infinite` |
| A domain's state, computeds and actions | `@softistx/riva/store` |
| Dehydrate on the server, hydrate in the browser, an ambient scope resolver | `@softistx/riva/ssr` |
| Your own `/_data` transport | `@softistx/riva/data` |
| React: provider and hooks | `@softistx/riva-react` (`/infinite`, `/entities`, `/store`) |
| GraphQL: typed documents, transport, selection-aware cache | `@softistx/riva-graphql` (`/infinite`, `/cache`) |
| GraphQL allowlist for a BFF (codegen, server source, browser transport) | `@softistx/riva-graphql/codegen`, `/server`, `/bff` |
| REST typed by OpenAPI, or a free fetcher | `@softistx/riva-rest` (`/entities`) |
| REST through a BFF | `@softistx/riva-rest/server`, `/bff` |
| React Router 8: one riva per request, SSR hydration, `/_data`, revalidation | `@softistx/riva-react-router` (`/server`) |

The peers each package adds, with their ranges, are in
`references/packages.md` and in each README's install section.

## 2. The wiring path

1. Read `node_modules/@softistx/riva/README.md`, then the guide of each area
   the app needs (`docs/guide/`).
2. Create one `Riva` (`createRiva()`): one in the browser, **one per
   request on the server**. Give it its transport (`provideGraphQL` or
   `provideRest`) when you create it.
3. Define queries and mutations once, as stateless module-level definitions;
   read them through the riva (`riva.get`, `def.ensure(riva, vars)`) or
   through the hooks.
4. In a React Router 8 app, add `rivaMiddleware` on the root route and
   `RivaRouterProvider` in the root component; loaders `ensure` their data and
   return `riva(context)`.
5. Add the optional parts one at a time (entities, infinite, store, BFF), each
   from its guide, and run the app's typecheck after each.
6. Run the specs of what changed, with the tools of the app's own `package.json`.

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

- A mutation without `updates`, `invalidates` or `cache` leaves nothing in
  place of its optimistic layer after success.
- `staleTime` defaults to 0: data hydrated from the server is refetched at
  once unless the definition sets a `staleTime`.
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
