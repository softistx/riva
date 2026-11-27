# RxJS

`@softistx/riva/rxjs` moves values between riva and Observables. It has five functions: `toObservable`, `data$`, `fromAsyncIterable`, `liveQuery` and `connect`. Nothing here is needed to use riva: the main entry never imports `rxjs`.

## Install

`rxjs ^7.8` is an optional peer. Install it only in an app that imports the subpath; importing `@softistx/riva/rxjs` without it fails at import ([troubleshooting](../troubleshooting.md)).

```sh
bun add rxjs
```

## `toObservable`: a state as a cold Observable

`toObservable(riva, def, vars?)` returns a cold Observable. Subscribing emits the current state, then each change; unsubscribing releases. Nothing runs before the first subscription.

```ts
import { createRiva, query, signal } from '@softistx/riva';
import { toObservable } from '@softistx/riva/rxjs';

const riva = createRiva();

// a signal or computed: its value
const count = signal(0);
const sub = toObservable(riva, count).subscribe(console.log); // 0
riva.set(count, 1); // 1
sub.unsubscribe();

// a query: its full state, observed like useQuery (fetches when missing or stale, polls)
const userQuery = query({ id: 'user', fetch: async (id: number) => ({ id }) });
toObservable(riva, userQuery, 1).subscribe(({ status, data, error }) => {
  console.log(status, data, error); // 'loading' → 'success'
});
```

An error is a value of the stream (`status: 'error'`), never its end.

A mutation handle (or any `{ state, subscribe }`) emits its state:

```ts
// riva created with `graphql: withGraphQL(client)`; SAVE_USER_MUTATION is your document
const save = riva.graphql.mutation(SAVE_USER_MUTATION);
toObservable(riva, save).subscribe((s) => console.log(s.status));
await save.mutate({ id: 1 });
```

## `data$`: the data alone

`data$` maps a query's (or a stateful handle's) state to its `data`, without repeats. It is `undefined` until there is data.

```ts
import { data$ } from '@softistx/riva/rxjs';

data$(riva, userQuery, 1).subscribe((user) => console.log(user?.id));
```

It takes a query or a `{ state, subscribe }` handle whose state has `data`, not a signal or computed (use `toObservable` for those).

## Async iterables: `fromAsyncIterable`

`fromAsyncIterable(source)` (also `toObservable(source)`, without a riva) takes an `AsyncIterable<T>`, or a factory `(signal: AbortSignal) => AsyncIterable<T>`. Unsubscribing calls the iterator's `return()`; the factory form also receives an abort signal.

```ts
import { fromAsyncIterable } from '@softistx/riva/rxjs';

// subscribeToMessages(opts): your function returning an AsyncIterable<Message>
const messages$ = fromAsyncIterable((signal) => subscribeToMessages({ signal }));
messages$.subscribe(console.log);
```

Prefer the factory form for generators: a bare generator object is single-use and shared by every subscription. A factory that throws synchronously ends the stream with `error`.

## `liveQuery`: a query fed by a stream

`liveQuery({ id, observe })` is a query whose data comes from an Observable, one per variables. It has the same derived key, cache and SSR snapshot as `query`, and is read like any query.

```ts
import { liveQuery } from '@softistx/riva/rxjs';
import { interval, map } from 'rxjs';

const priceQuery = liveQuery({
  id: 'price',
  observe: (symbol: string) => interval(1000).pipe(map((n) => 100 + n)),
  gcTime: '1m',
});
```

On the server, in a loader: `ensure()` resolves at the first value, then unsubscribes. A stream that stays silent stops with the request's abort, and the snapshot carries the value.

```ts
import { riva, rivaOf } from '@softistx/riva-react-router';
import type { Route } from './+types/prices';

export async function loader({ context }: Route.LoaderArgs) {
  await priceQuery.ensure(rivaOf(context), 'ACME'); // first value, stream closed
  return riva(context);
}
```

In a browser:

- the stream is subscribed while the query is observed (`useQuery`, `riva.subscribe`, `toObservable`);
- `ensure()` with no observer closes the stream at once;
- the data stays for `gcTime` after the last release;
- there is no `staleTime`: an observed entry is live, and passing one is a type error.

Failures:

- an error before the first value rejects like any query error, and the retry policy applies;
- an error after the first value sets the error state and keeps the last data. The stream does not reconnect on its own: `refetch()` from `useQuery` (or `invalidate`), or a new observer after a release, subscribes again;
- `complete` keeps the last value and does not reconnect;
- a stream that completes without ever emitting rejects with a `RIVA_LIVE` error. Give it a value with `startWith` or `defaultIfEmpty` ([troubleshooting](../troubleshooting.md)).

```ts
const sub = toObservable(riva, priceQuery, 'ACME').subscribe(({ status, data, error }) => {
  if (status === 'error') console.log('kept', data, error); // data is the last good value
});
priceQuery.invalidate(riva, 'ACME'); // observed: subscribes the stream again after an error
```

## `connect`: a stream into a state

`connect(riva, state, obs$)` subscribes and writes each value into a signal, in that riva. It returns the stop. The Observable's type must match the signal's.

```ts
import { createRiva, signal } from '@softistx/riva';
import { connect } from '@softistx/riva/rxjs';
import { fromEvent, map } from 'rxjs';

const width = signal(0);
const riva = createRiva();

const stop = connect(
  riva,
  width,
  fromEvent(window, 'resize').pipe(map(() => window.innerWidth)),
);

riva.get(width); // follows the window
stop(); // unsubscribes; calling it again does nothing
```

- Definitions stay stateless: two rivas connected to the same signal hold their own values.
- `complete` leaves the last value in place.
- An `error` ends the connection and is swallowed, so nothing is thrown into your code: the signal keeps its last value. To keep the stream alive or surface the failure, handle it upstream:

```ts
import { createRiva, signal } from '@softistx/riva';
import { connect } from '@softistx/riva/rxjs';
import { catchError, EMPTY, type Observable, retry } from 'rxjs';

const riva = createRiva();
const price = signal(0);
declare const feed$: Observable<number>; // your stream

connect(riva, price, feed$.pipe(retry({ delay: 1000 }), catchError(() => EMPTY)));
```

## In React

A live query reads like any query, and stays subscribed while a component observes it:

```tsx
import { useQuery } from '@softistx/riva-react';

function Price({ symbol }: { symbol: string }) {
  const { data, status } = useQuery(priceQuery, symbol);
  return status === 'success' ? <b>{data}</b> : <span>…</span>;
}
```

To feed a signal from a stream for the life of a component, call `connect` in an effect and return the stop:

```tsx
import { useRiva } from '@softistx/riva-react';
import { connect } from '@softistx/riva/rxjs';
import { useEffect } from 'react';

function WidthWatcher() {
  const riva = useRiva();
  useEffect(() => connect(riva, width, resize$), [riva]); // width: a signal, resize$: Observable<number>
  return null;
}
```

## Size

The budget is in the [README's Size section](../../README.md#size-budget).
