# Signals, computeds and effects

Reactive values for local state. Use them for client state that is not fetched (a filter, a selected row, a cart). Definitions are stateless: the value of a signal lives in a `RivaClient`, one per request on the server, so values never leak between requests.

## The basics

```ts
import { batch, computed, createRivaClient, signal, untracked } from '@softistx/riva';

const count = signal(0);
const double = computed((get) => get(count) * 2); // lazy, cached, tracked dynamically

const client = createRivaClient();
client.subscribe(double, (v) => console.log('double', v));
client.set(count, 2); // logs "double 4"
client.set(count, (n) => n + 1); // logs "double 6"
client.get(double); // 6
```

`client.get`, `client.set`, `client.subscribe`, `client.effect`, `client.run` and `client.batch` are the whole API outside any ambient scope. `client.subscribe(def, listener)` returns an unsubscribe function.

## Ambient reads

Inside `client.run`, signals and computeds read through that client, so a definition can call `.get()` and `.set()` itself:

```ts
client.run(() => {
	count.set(10);
	batch(() => {
		count.set(11);
		count.set(12);
	}); // one notification at the end
	untracked(() => count.get()); // read without becoming a dependency
});
```

- `batch(fn)` groups writes into one notification; reads inside see the new values at once.
- `untracked(fn)` reads without registering a dependency in the surrounding computed or effect.
- Without a client in scope, `count.get()` throws `RivaScopeError` (`RIVA_SCOPE`). In a browser, `setDefaultClient(client)` sets one default; `setDefaultClient(undefined)` clears it. On the server it throws, because a module-level client would leak between requests. A host supplies the scope with `setScopeResolver` (see [ssr](./ssr.md)).

## Effects

```ts
client.effect(() => {
	const n = client.get(count);
	return () => console.log('leaving', n); // runs before each re-run and on dispose
});
```

- `client.effect(fn)` always runs. The free function `effect(fn)` re-runs on the ambient client in a browser and is a **no-op on the server**.
- The cleanup the effect returns runs before each re-run.
- An effect that keeps writing its own source throws `RIVA_LOOP` after 100 re-runs in one flush.

## Options

| Call | Options | Defaults |
| --- | --- | --- |
| `signal(initial, opts?)` | `name?: string`, `equals?: (a, b) => boolean`, `ssr?: boolean` | `equals` is `Object.is`; `ssr` is `false` |
| `computed(fn, opts?)` | `name?: string`, `equals?: (a, b) => boolean` | `equals` is `Object.is` |

- Subscribers fire only when the value changes by `equals`, once per change, never on a half-updated graph.
- `ssr: true` with a unique `name` sends the value in an SSR snapshot once it differs from its initial value (see [ssr](./ssr.md)). Every other signal stays local.
- `computed(fn)` receives `get`; dependencies are tracked dynamically, per run.
- Exported types: `Signal`, `SignalOptions`, `ReadonlySignal`, `Computed`, `ComputedOptions`, `Readable`, `Getter`, `Listener`, `Unsubscribe`, `EffectFn`.

## Traps

- A computed that reads itself throws `RIVA_CYCLE`.
- A listener or effect that throws never stops the others: every notification runs, then the single error is rethrown as is, and several become an `AggregateError`.
- After an `await` inside `client.run`, the ambient scope may be gone in a browser-only setup: read through `client.get(def)` instead. The React Router host keeps the scope across awaits.

See [troubleshooting](../troubleshooting.md) for the messages.
