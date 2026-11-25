# riva-rest docs

The package's [README](../README.md) is the short path. These pages go deeper.

## Guides

| Page | Read it when |
|---|---|
| [Simple API](./guide/simple-api.md) | You call `riva.rest.get / mutation / post / put / patch / delete` instead of defining. |
| [Transport](./guide/transport.md) | You wire a riva to the API, per request on a server. |
| [OpenAPI mode](./guide/openapi.md) | You have a spec and want typed `query` and `mutation` from it. |
| [Free fetcher](./guide/free-fetcher.md) | The API has no schema and you write the function. |
| [Errors](./guide/errors.md) | You branch on a failure or map httpyz errors. |
| [BFF mode](./guide/bff.md) | The browser must never reach the API. |
| [Cache](./guide/cache.md) | Several queries show the same resource and must stay in step. |

## Also

- [Troubleshooting](./troubleshooting.md): every error message and `RivaError` code this package throws, with the fix.
- [The core guides](https://github.com/softistx/riva/blob/develop/packages/riva/docs/README.md).
