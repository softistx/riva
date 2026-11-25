---
'@softistx/riva-react': minor
---

Add the React bindings: `RivaProvider` and `useClient`, `useSignal` and `useValue`, `useQuery` (with `enabled` and Suspense, `data` non-optional under `suspense: true`, and `refetch`), `useMutation`, plus the opt-in `@softistx/riva-react/infinite` (`useInfiniteQuery`) and `@softistx/riva-react/entities` (`useFragment`) entries. Every hook binds through `useSyncExternalStore` and renders on the server, with one client per request.
