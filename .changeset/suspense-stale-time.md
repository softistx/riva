---
'@softistx/riva': minor
'@softistx/riva-react': patch
---

Read the definition's `staleTime` under Suspense. `useQuery` and `suspenseStaleTime` (`@softistx/riva-react/resource`, now taking the definition as an optional third argument) trust the call's `staleTime`, else the definition's, else the riva's default, never less than 1000 ms; a definition with `staleTime: '5m'` no longer refetches on its first mount after Suspense. `@softistx/riva/resource` exports `toMs`, which riva-react now reuses instead of a private copy: an invalid duration string now throws `RIVA_DURATION` where the copy returned 0 (intended).
