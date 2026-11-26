---
'@softistx/riva-react': minor
---

Resetting the error boundary of a Suspense query or resource that failed now retries it by itself: `useQuery` and `useResource` with `suspense` throw the error once, then refetch and suspend when the boundary renders them again, and a new failure reaches the boundary again. The `onReset={() => def.prefetch(…)}` workaround is no longer needed. React's synchronous render retry never refetches, and the server still throws.
