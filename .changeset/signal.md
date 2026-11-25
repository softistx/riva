---
'@softistx/riva': minor
'@softistx/riva-react': minor
---

Rename `atom` to `signal`: `atom()`, `Atom`, `AtomOptions` and `useAtom` are now `signal()`, `Signal`, `SignalOptions` and `useSignal`. The graph node kind is `'signal'`, and the SSR error messages say "signal". No alias is kept.
