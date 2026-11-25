# @softistx/riva-react

## 0.1.1

### Patch Changes

- [#51](https://github.com/softistx/riva/pull/51) [`2d37f07`](https://github.com/softistx/riva/commit/2d37f0738e219b1107bec37e4a5a7779034be7a7) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Store follow-ups. A store definition replaced by a hot reload no longer takes its name back when a component still holding it is read again: it resolves to the current instance, with no reset of the state (the server still refuses a duplicate name). The browser test is shared with the query entry (`'document' in globalThis`) and the `happy-dom`/`jsdom` case is documented. The limit of `useStore` for a `memo` child that alone reads a new key is documented, and a spec covers a render React discards leaving its keys uncommitted.
- Updated dependencies [[`2d37f07`](https://github.com/softistx/riva/commit/2d37f0738e219b1107bec37e4a5a7779034be7a7)]:
  - @softistx/riva@0.1.1

## 0.1.0

### Minor Changes

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add the React bindings: `RivaProvider` and `useClient`, `useSignal` and `useValue`, `useQuery` (with `enabled` and Suspense, `data` non-optional under `suspense: true`, and `refetch`), `useMutation`, plus the opt-in `@softistx/riva-react/infinite` (`useInfiniteQuery`) and `@softistx/riva-react/entities` (`useFragment`) entries. Every hook binds through `useSyncExternalStore` and renders on the server, with one client per request.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add domain stores as the opt-in `@softistx/riva/store` entry: `store({ name, ssr?, state, computed, actions })` groups a domain's state, computeds and actions. Each state key is a signal named `<name>.<key>` and each computed a riva computed, read as definitions; only actions write (batched, `s` stays bound to its client across `await`), and any other write throws `RIVA_STORE`. `ReadonlySignal` is a new type of the main entry. `@softistx/riva-react/store` adds `useStore(def)`, which returns `[s, a]` with `s` tracked per key.

### Patch Changes

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A guide page per area in each package's `docs/guide/`, a docs index, a troubleshooting entry per error, and READMEs that point to them.
- Updated dependencies [[`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9)]:
  - @softistx/riva@0.1.0
