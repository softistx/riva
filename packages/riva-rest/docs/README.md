# riva-rest docs

The package's [README](../README.md) is the short path. These pages go deeper.

## Guides

| Page | Read it when |
|---|---|
| [Transport](./guide/transport.md) | You wire a riva to the API, per request on a server. |
| [OpenAPI mode](./guide/openapi.md) | You have a spec and want typed `query` and `mutation` from it. |
| [Free fetcher](./guide/free-fetcher.md) | The API has no schema and you write the function. |
| [Errors](./guide/errors.md) | You branch on a failure or map httpyz errors. |
| [BFF mode](./guide/bff.md) | The browser must never reach the API. |
| [Cache](./guide/cache.md) | Several queries show the same resource and must stay in step. |

## Also

- [Troubleshooting](./troubleshooting.md): every error message and `RivaError` code this package throws, with the fix.
- [The core guides](../../riva/docs/README.md).
