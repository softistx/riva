---
'@softistx/riva': minor
'@softistx/riva-react': minor
---

Add domain stores as the opt-in `@softistx/riva/store` entry: `store({ name, ssr?, state, computed, actions })` groups a domain's state, computeds and actions. Each state key is a signal named `<name>.<key>` and each computed a riva computed, read as definitions; only actions write (batched, `s` stays bound to its client across `await`), and any other write throws `RIVA_STORE`. `ReadonlySignal` is a new type of the main entry. `@softistx/riva-react/store` adds `useStore(def)`, which returns `[s, a]` with `s` tracked per key.
