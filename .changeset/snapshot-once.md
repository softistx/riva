---
'@softistx/riva-react-router': minor
---

`riva(context)` emits each snapshot key once per request: the first call holds the whole request riva, a later call only the entries and signals not emitted yet or changed since. Every loader that needs it can now return `riva(context)` without repeating data in the hydration payload.
