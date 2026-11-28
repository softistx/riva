---
"@softistx/riva-react": patch
---

A suspended `useQuery(liveQuery(...), { suspense: true })` keeps its single subscription however long the Suspense boundary waits: the render's watcher is released when the mounted component observes the entry, not after a fixed second. A component that never mounts releases it at the entry's `gcTime`, on riva's scheduler (no timer on the server).
