# AGENTS.md

riva is the organisation's state and data layer: one API for local state,
server state (GraphQL and REST), cache and mutations, with SSR as a native mode
and React Router (and `@softistx/alxia-react-router`) as first-class hosts. The
goal is ultra DX: one mental model, typed end to end, no hand-written keys, no
glue code between three libraries.

It is a library monorepo of five packages under `packages/`: `riva` (the core),
`riva-react`, `riva-graphql`, `riva-rest` and `riva-react-router`, published as
`@softistx/<dir>` to npmjs by `publish.yml`. The v1 plan is in
[docs/roadmap.md](./docs/roadmap.md).

The owner's global rules in `~/.claude/CLAUDE.md` apply here, with no
departure.

## Invariants

- The core has zero runtime dependencies and no DOM and no React.
- Adapters reach what they wrap as peers, by range; the core never imports an
  adapter.
- Errors are defined once, in the core, and thrown by the adapters, so
  `instanceof` holds.
- Definitions are stateless; values live per `RivaClient`. No module-level
  state; a server read with no client in scope throws (the SSR leak guard).
- Keys are derived (definition id + stable-serialized variables), never
  handwritten.
- Size budget: core <= 6 kB gzipped, core + react <= 9 kB.
- Type inference is covered by type tests (`expectTypeOf`).
- A spec sits beside every source file (`x.ts` and `x.test.ts`).
- [docs/spec.md](./docs/spec.md) is the decision record (D1 to D16); only the
  owner changes it.
