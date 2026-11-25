# riva-react-router docs

The package's [README](../README.md) is the short path. These pages go deeper.

## Guides

| Page | Read it when |
|---|---|
| [Setup](./guide/setup.md) | You wire the riva factory, the middleware and the provider in the root route. |
| [The loader pattern](./guide/loader.md) | You await data in a loader and read it in a component, and need to know how hydration works. |
| [The `/_data` route](./guide/data-route.md) | The browser must run operations through your server (BFF). |
| [After a write](./guide/after-a-write.md) | An action or a mutation must refresh what is on screen. |

## Advanced: definitions

| Page | Read it when |
|---|---|
| [Shared definitions](https://github.com/softistx/riva/blob/develop/packages/riva/docs/guide/shared-definitions.md) | A loader should `ensure` a query definition, or an action's answer should fill an entry. |

## Also

| Page | Read it when |
|---|---|
| [Troubleshooting](./troubleshooting.md) | Every error message and `RIVA_DATA_*` code this package throws, with the fix. |
| [Roadmap](https://github.com/softistx/riva/blob/develop/docs/roadmap.md) | You want to know what is next. |
| [The core docs](https://github.com/softistx/riva/blob/develop/packages/riva/docs/README.md) | You need the guides of `@softistx/riva` itself. |
