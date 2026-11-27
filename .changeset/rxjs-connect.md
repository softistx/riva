---
'@softistx/riva': minor
---

Add `connect(riva, state, obs$)` to `@softistx/riva/rxjs`: subscribes to an Observable and writes each value into a signal of that riva, returning an idempotent stop that unsubscribes. The Observable's type must match the signal's; `complete` keeps the last value, an `error` ends the connection and is swallowed (the signal keeps its last value). Also adds the RxJS guide and troubleshooting entries.
