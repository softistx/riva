---
'@softistx/riva-rest': minor
---

`query` and `mutation` take the generated `operations` table alone, `query(operations, 'get /invoices/{id}')`, so a definition module imports no client and the riva's transport supplies it at run time. The data is typed as the decoded reply; the client form stays for a `decode: false` client. `operations()` from `@softistx/riva-rest/server` accepts the bare table too. The error for an unknown route now reads `riva-rest: no OpenAPI operation at …`.
