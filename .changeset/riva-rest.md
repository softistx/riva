---
'@softistx/riva-rest': minor
---

Add the REST transport: `query` and `mutation` typed from an `@softistx/openapi-httpyz` client by route (`query(api, 'get /invoices/{id}')`, the id derived from the route), a free-fetcher mode (`query({ id, fetch })`) for APIs with no schema, `provideRest` and `httpyzTransport` over `@softistx/httpyz` with the signal flowing end to end, httpyz's errors mapped to `RivaHttpError`, `RivaNetworkError` and `RivaRequestError`, and `@softistx/riva-rest/entities`, whose `restEntities` opts REST responses into the core's entity store. A misused definition (a route that does not fit, a missing `id`) throws a `RivaError` with the `RIVA_DEFINITION` code.
