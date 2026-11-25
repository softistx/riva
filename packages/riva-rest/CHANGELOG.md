# @softistx/riva-rest

## 0.1.0

### Minor Changes

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add BFF mode for REST: `@softistx/riva-rest/bff`'s `bffTransport` posts `{ id: 'rest:<operationId>', variables }` to a `/_data` route from the browser (errors come back as the core's classes), and `@softistx/riva-rest/server`'s `operations(api)` runs the spec's operations on the server through the request client's REST transport. In the browser a free fetcher that reads `http` throws `RivaScopeError` naming server-only use. `bffTransport` runs on `@softistx/riva/data`'s `postData`, and `BffTransportOptions` is re-exported from `/bff`.

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add the REST transport: `query` and `mutation` typed from an `@softistx/openapi-httpyz` client by route (`query(api, 'get /invoices/{id}')`, the id derived from the route), a free-fetcher mode (`query({ id, fetch })`) for APIs with no schema, `provideRest` and `httpyzTransport` over `@softistx/httpyz` with the signal flowing end to end, httpyz's errors mapped to `RivaHttpError`, `RivaNetworkError` and `RivaRequestError`, and `@softistx/riva-rest/entities`, whose `restEntities` opts REST responses into the core's entity store. A misused definition (a route that does not fit, a missing `id`) throws a `RivaError` with the `RIVA_DEFINITION` code.

### Patch Changes

- [#47](https://github.com/softistx/riva/pull/47) [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A guide page per area in each package's `docs/guide/`, a docs index, a troubleshooting entry per error, and READMEs that point to them.
- Updated dependencies [[`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9), [`241028c`](https://github.com/softistx/riva/commit/241028c1788f8a61b8a5e42816a00a1aa1e7e2e9)]:
  - @softistx/riva@0.1.0
