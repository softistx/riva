# Server rendering: `@softistx/riva/ssr`

Moves what a request fetched to the browser, so the first render needs no second fetch. It holds no state of its own: a snapshot is plain JSON.

```ts
import { createRivaClient } from '@softistx/riva';
import { dehydrate, hydrate } from '@softistx/riva/ssr';

const client = createRivaClient();

// On the server, once the request's loaders are done:
const snapshot = dehydrate(client); // JSON-safe, hand it to the page

// In the browser, before the first render:
hydrate(client, snapshot);
```

The snapshot's fields are an opaque format that may change: never build or edit one, only pass on what `dehydrate` returned. With React Router, `@softistx/riva-react-router` does both for you.

## Embedding the snapshot safely

Hand it to the page through the host's loader data (React Router serializes it safely). If you inline it in a `<script>` yourself, escape `<` so a value such as `</script>` cannot close the tag:

```ts
const json = JSON.stringify(snapshot).replace(/</g, '\\u003c');
const html = `<script id="riva" type="application/json">${json}</script>`;
```

## `dehydrate(client)`

- Writes the settled query entries (successes and errors; idle and in-flight ones are skipped), read as readers see the committed data: a normalized or infinite entry travels denormalized and is stored again by its own cache policy on arrival. Optimistic layers never travel.
- Each entry carries its age, not the server's clock, so a skewed clock cannot make fresh data stale.
- Signals travel only when they opt in with `ssr: true`, have a unique `name` and changed from their initial value (`signal(0, { name: 'cart', ssr: true })`). Every other signal stays local, riva's own included.
- Dates survive, as do `NaN` and the infinities. A bigint, a function, a symbol, a `Map`, a `Set`, an instance of a class or a cycle is refused with `RIVA_SSR`, naming its path.
- A failed entry travels as its code, status and `retryable`, with no message and no stack, so a server detail cannot leak. Anything that was not a `RivaError` travels as `RIVA_UNKNOWN`.

## `hydrate(client, snapshot, opts?)`

| Option | Default | Effect |
| --- | --- | --- |
| `deferObserved` | `false` | For a render: nothing that could reach an observed entry is written. The entries something observes, those with a cache policy (they share entities) and those not created yet are **returned** as a snapshot to apply later, outside the render, with `hydrate(client, deferred)`. Its ages are understated by the delay. |

- It seeds entries and signals the client has not created yet, at the moment their definition is first used, so the hydrating code needs none of the definitions.
- An entry the client already has is replaced only by a newer snapshot, and never while it is fetching or carries optimistic layers. An existing signal is never overwritten.
- A fresh entry is not fetched again: data hydrated with the definition's `staleTime` stays fresh for it. The default `staleTime` is 0, so set one for hydrated data (see [troubleshooting](../troubleshooting.md#data-refetches-right-after-hydration)).
- A failed entry comes back as a `RivaError` (a `RivaRequestError` when it had a status) with an empty message; `RIVA_NETWORK`, `HTTP_<n>` and `RIVA_ABORT` come back as `RivaNetworkError`, `RivaHttpError` and `RivaAbortError`.

## The ambient scope: `setScopeResolver(fn)`

Lets a host supply the ambient client, for example from a request context kept in an `AsyncLocalStorage`. `fn` is `() => RivaClient | undefined`; `client.run` still wins, then the resolver, then the browser's default client. With no resolver, or one that returns `undefined`, a server read with no client throws `RIVA_SCOPE`. There is one resolver per process: a second call replaces the first.

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import type { RivaClient } from '@softistx/riva';
import { setScopeResolver } from '@softistx/riva/ssr';

const als = new AsyncLocalStorage<RivaClient>();
setScopeResolver(() => als.getStore());
```

## Codec

`encode(value)` and `decode(value)` are the codec the snapshot uses (Dates and non-finite numbers survive). They are exported for transports of your own; `@softistx/riva/data` uses them for variables.

Exports: `dehydrate`, `hydrate`, `encode`, `decode`, `setScopeResolver`, the type `Snapshot`.
