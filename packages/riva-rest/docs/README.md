# riva-rest docs

The package's [README](../README.md) is the short path. These pages go deeper.

## Guides

| Page | Read it when |
|---|---|
| [Simple API](./guide/simple-api.md) | You call `riva.rest.get / mutation / post / put / patch / delete`, in code, loaders and components. Start here. |
| [Transport](./guide/transport.md) | You wire a riva to the API (`withRest(api)`), per request on a server. |
| [Errors](./guide/errors.md) | You branch on a failure or map httpyz errors. |
| [BFF mode](./guide/bff.md) | The browser must never reach the API. |

## Advanced: shared definitions

| Page | Read it when |
|---|---|
| [Shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md) | You wonder when a `query()` or `mutation()` beats the simple call. |
| [OpenAPI mode](./guide/openapi.md) | You have a spec and want typed `query` and `mutation` from it. |
| [Free fetcher](./guide/free-fetcher.md) | The API has no schema and you write the function. |
| [Cache](./guide/cache.md) | Several queries show the same resource and must stay in step. |

## Also

| Page | Read it when |
|---|---|
| [Troubleshooting](./troubleshooting.md) | Every error message and `RivaError` code this package throws, with the fix. |
| [Roadmap](https://github.com/softistx/riva/blob/develop/docs/roadmap.md) | You want to know what is next. |
| [The core guides](https://github.com/softistx/riva/blob/develop/packages/riva/docs/README.md) | You need resources, signals or SSR of `@softistx/riva` itself. |
