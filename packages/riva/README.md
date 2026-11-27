# @softistx/riva

Core: signals, Riva, query and mutation engine, normalized and keyed cache, pagination, optimistic layer, dehydrate and hydrate. Pure TypeScript, no DOM, no React.

Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md). Guides and fixes: [docs](./docs/README.md).

```sh
bun add @softistx/riva
```

Zero runtime dependencies. Values live in a `Riva`: one per request on the server, so values never leak between requests.

## Quick start

Create a riva with the adapters you use, then call GraphQL or REST like a function. Each call is a typed, awaitable, reactive resource; there is nothing to define first.

```ts
import { createGraphQLClient } from '@softistx/graphql-client';
import { createRiva } from '@softistx/riva';
import { withGraphQL } from '@softistx/riva-graphql';
import { BOOKS_QUERY } from './graphql'; // a typed document

const riva = createRiva({
	graphql: withGraphQL(createGraphQLClient({ url: 'https://api.example.com/graphql' })),
	defaults: { staleTime: '30s' }, // every query that sets none of its own
});

const data = await riva.graphql.query(BOOKS_QUERY, { first: 10 }); // one-shot: the data, or throws
const books = riva.graphql.query(BOOKS_QUERY, { first: 10 }); // the same call, as a resource
books.state; // { status: 'idle' | 'loading' | 'success' | 'error', data, error, isFetching, placeholder }
```

`@softistx/riva-rest` gives `riva.rest.get(path, input)` the same way, and the hooks live in the adapters (`useGraphQL` from `@softistx/riva-graphql/react`, `useRest` from `@softistx/riva-rest/react`), over `@softistx/riva-react`. The core holds what they stand on, below.

| Import | Holds | Guide |
| --- | --- | --- |
| `@softistx/riva` | `signal`, `computed`, `effect`, `batch`, `createRiva`, `query`, `mutation`, the errors | [signals](./docs/guide/signals.md), [queries](./docs/guide/queries.md), [mutations](./docs/guide/mutations.md), [errors](./docs/guide/errors.md) |
| `@softistx/riva/entities` | the normalized cache | [entities](./docs/guide/entities.md) |
| `@softistx/riva/infinite` | cursor pagination | [infinite](./docs/guide/infinite.md) |
| `@softistx/riva/store` | domain stores | [store](./docs/guide/store.md) |
| `@softistx/riva/resource` | reactive resources: tracked variables, `enabled`, built-in `idle / loading / success / error` | [resources](./docs/guide/resources.md) |
| `@softistx/riva/ssr` | dehydrate, hydrate, scope resolver | [ssr](./docs/guide/ssr.md) |
| `@softistx/riva/data` | the browser's `/_data` riva | [data](./docs/guide/data.md) |
| `@softistx/riva/rxjs` | cold Observables of states (`toObservable`, `data$`, `fromAsyncIterable`) and `liveQuery`, needs `rxjs` | [RxJS](#rxjs) |

## Extensions

`createRiva` takes named extensions beside `scheduler` and `events`: any object with an `install(riva)` method (a `RivaExtension`). Its result is set once on the instance as `riva[name]`, fully typed. A key that is neither an option nor an extension is a type error, so a misspelt option (`default` for `defaults`) does not compile. An adapter ships one; the core never imports it.

```ts
import { createRiva, type RivaExtension } from '@softistx/riva';

const clock: RivaExtension<{ now(): number }> = {
	install: () => ({ now: () => Date.now() }),
};

const riva = createRiva({ clock, defaults: { staleTime: '30s' } });
riva.clock.now(); // typed
```

`defaults.staleTime` applies to every query that sets no `staleTime` of its own.

Extensions install once, in key order, so an install sees the extensions before it but not those after. A Riva member name (`get`, `set`, `run`, …) is a type error and throws `RIVA_DEFINITION`; option names (`defaults`, `scheduler`, `events`) are refused by the types. Pass the options inline, or keep the inferred type of a pre-built object: options annotated as `RivaOptions` lose the extension types and give a plain `Riva`.

## Resources

What `riva.graphql.query` and `riva.rest.get` return: a reactive, awaitable view of one query entry. With a function for the variables and `enabled`, the call tracks signals:

```ts
import { signal } from '@softistx/riva';

// `riva` is the one of the quick start; BOOKS_QUERY is a typed document (schematic).
const page = signal(1);
const signedIn = signal(true);
const books = riva.graphql.query(
	BOOKS_QUERY,
	() => ({ page: riva.get(page) }), // tracked: a new page is a new key
	{ enabled: () => riva.get(signedIn) }, // while false: `idle`, the function is not called
);

books.subscribe((s) => {
	if (s.status === 'success') render(s.data, s.placeholder); // `placeholder`: the previous page, until the new one lands
});
const first = await books; // or a one-shot load that rejects with the error
```

`resource(riva, source, options)` from `@softistx/riva/resource` builds the same thing over a query definition of your own.

Also `mutationHandle(riva, mutate)` (a callable with a reactive `state` and `reset`) and `streamResource(riva, source)` (a subscription as a resource). A resource starts at its first reader and stops at the last; the status is `idle | loading | success | error`. [resources](./docs/guide/resources.md).

For adapter authors and wrappers, also from `@softistx/riva/resource`:

- `trackedInput(riva, input)`: reads a plain value, a signal or computed, or a tracked function (type `TrackedInput`); `isReactive(x)` tells a signal or computed.
- `abortable(resource, signal)`: `await` rejects with a `RivaAbortError` on abort.
- `callResource(riva, def, read, call)`: the resource of one query call, from its `enabled`, `keepPrevious`, `staleTime` (type `CallOptions`) and `signal`.
- `toMs(duration)`: a duration (`'30s'`, `'1.5m'` or a number) as milliseconds; an invalid string throws `RIVA_DURATION`.
- `mutateInvalidating(riva, def, vars, call, target)`: runs a mutation, then marks stale what `call.invalidates` names.
- `RivaGraphQLError` and its entry type `GraphQLErrorEntry`: the error a GraphQL adapter throws for a response with `errors` (the data it kept is on the error).

## Signals

```ts
import { batch, computed, createRiva, signal, untracked } from '@softistx/riva';

const count = signal(0);
const double = computed((get) => get(count) * 2); // lazy, cached, tracked dynamically

const riva = createRiva();
riva.subscribe(double, (v) => console.log('double', v));
riva.set(count, 2); // logs "double 4"
riva.set(count, (n) => n + 1); // logs "double 6"

riva.run(() => {
	count.set(10); // ambient reads and writes go through that riva
	batch(() => { count.set(11); count.set(12); }); // one notification at the end
	untracked(() => count.get()); // read without becoming a dependency
});

riva.effect(() => {
	const n = riva.get(count);
	return () => console.log('leaving', n); // runs before each re-run
});
```

`signal(initial, { name?, equals?, ssr? })`, `computed(fn, { name?, equals? })`. A read with no riva in scope throws `RivaScopeError` (`RIVA_SCOPE`): read through `riva.get(def)` or wrap the code in `riva.run(() => …)`. In a browser, `setDefaultRiva(riva)` sets one default; on the server it throws. Details: [signals](./docs/guide/signals.md).

## Definitions

A definition is a query, a mutation or an infinite list written once at module level, for the settings several call sites share: polling, refetch on focus, optimistic updates, the cache written by a mutation. Use the simple API first; reach for a definition when it cannot say what you need. [Advanced: shared definitions](./docs/guide/shared-definitions.md) says when, with examples.

```ts
import { createRiva, mutation, query } from '@softistx/riva';

const todos = query({ id: 'todos', staleTime: '30s', fetch: async () => (await fetch('/api/todos')).json() as Promise<string[]> });
const addTodo = mutation<string, string>({
	id: 'addTodo',
	mutate: async (title, { signal }) => (await fetch('/api/todos', { method: 'POST', body: title, signal })).text(),
	optimistic: (title, tx) => tx.set(todos, undefined, (prev) => [...(prev ?? []), title]), // shown at once
	invalidates: [todos], // observed ones refetch
});

const riva = createRiva();
await todos.ensure(riva); // fetch if missing or stale, else the cache
await addTodo.mutate(riva, 'Buy milk'); // rejects, with the layer dropped, on failure
```

Every option: [queries](./docs/guide/queries.md), [mutations](./docs/guide/mutations.md), [entities](./docs/guide/entities.md) (`@softistx/riva/entities`, the normalized cache) and [infinite lists](./docs/guide/infinite.md) (`@softistx/riva/infinite`, cursor pagination). Trap: after success the optimistic layer is dropped, so give the mutation `updates`, `invalidates` or `cache`.

## Stores

```ts
import { store, type StoreContext } from '@softistx/riva/store';

// Book is your type; saveBook is a mutation definition (schematic).
interface Book { isbn: string; title: string }

export const BookStore = store({
	name: 'books',
	state: { items: [] as Book[], filter: '' },
	computed: { total: (s) => s.items.length },
	actions: {
		add(s, book: Book) { s.items = [...s.items, book]; }, // only actions write
		async save(s, book: Book, { mutate }: StoreContext) { s.items = [...s.items, await mutate(saveBook, { book })]; },
	},
});

const [s, a] = BookStore.bind(riva); // read-only view and bound actions
```

The context, `reset`, naming rules and SSR: [store](./docs/guide/store.md).

## Server rendering

```ts
import { dehydrate, hydrate } from '@softistx/riva/ssr';

const snapshot = dehydrate(riva); // on the server, once the loaders are done
hydrate(riva, snapshot); // in the browser, before the first render
```

The snapshot is an opaque format: pass on what `dehydrate` returned. A fresh entry is not fetched again, so give hydrated queries a `staleTime`. Escaping, `deferObserved` and `setScopeResolver`: [ssr](./docs/guide/ssr.md).

## Errors

`RivaError` (with a `code`) is the base class, defined once here so `instanceof` holds. `RivaScopeError` (`RIVA_SCOPE`), `RivaRequestError` (`status?`, `retryable`), `RivaHttpError` (`HTTP_<status>`), `RivaNetworkError` (`RIVA_NETWORK`), `RivaAbortError` (`RIVA_ABORT`); `RivaGraphQLError` (with its `GraphQLErrorEntry` type, both from `@softistx/riva/resource`) for a GraphQL response with `errors`; `isRetryableStatus(status)` tells whether an HTTP status is worth retrying (5xx, 408, 429); `RIVA_CYCLE`, `RIVA_LOOP`, `RIVA_DURATION`, `RIVA_KEY`, `RIVA_CACHE`, `RIVA_STORE` and `RIVA_SSR` are plain `RivaError`s. [errors](./docs/guide/errors.md), [troubleshooting](./docs/troubleshooting.md).

## Data route riva

`@softistx/riva/data` is the browser's side of a `/_data` route, for a transport of your own: `postData(opts, id, variables, signal?)`. [data](./docs/guide/data.md).

## RxJS

`@softistx/riva/rxjs` turns riva into cold Observables. `rxjs ^7.8` is an optional peer that only this subpath needs; the main entry never imports it, and importing `@softistx/riva/rxjs` without it installed fails at import.

```sh
bun add rxjs
```

```ts
import { createRiva, query } from '@softistx/riva';
import { data$, fromAsyncIterable, liveQuery, toObservable } from '@softistx/riva/rxjs';

const riva = createRiva();
const userQuery = query({ id: 'user', fetch: async (id: number) => ({ id }) });

// Full states: { status, data, error, isFetching, updatedAt }
const sub = toObservable(riva, userQuery, 1).subscribe(console.log);
sub.unsubscribe(); // releases the query

data$(riva, userQuery, 1).subscribe(console.log); // the data alone, no repeats

// A mutation handle (e.g. `riva.graphql.mutation(DOC)` or `mutationHandle`): its state
// toObservable(riva, saveHandle).subscribe(console.log);
```

Subscribing observes a query like `useQuery` and unsubscribing releases it. An error is a value of the stream, never its end. `toObservable` also takes a signal or computed (its value). `data$` takes a query or a `{ state, subscribe }` handle whose state has `data`, not a signal or computed.

### Async streams

`fromAsyncIterable(source)` (or `toObservable(source)`) takes an `AsyncSource<T>`: an `AsyncIterable<T>`, or a factory `(signal: AbortSignal) => AsyncIterable<T>`. Unsubscribing calls the iterator's `return()`; only the factory form also gets an abort, through its `signal`. A bare generator object is single-use and shared by every subscription to it, so prefer the factory form for generators:

```ts
const messages$ = fromAsyncIterable((signal) => subscribeToMessages({ signal }));
```

A factory that throws synchronously ends the stream with `error`.

### Live queries

`liveQuery({ id, observe })` is a query fed by a stream: the same key, cache and SSR as `query`, read with `riva.get`, `riva.subscribe`, `ensure` or `useQuery(liveQuery)`.

```ts
const priceQuery = liveQuery({
  id: 'price',
  observe: (symbol: string) => prices$(symbol), // Observable<number>
});
```

On the server `ensure()` resolves at the first value, then unsubscribes; a stream that stays silent stops with the request's signal, and the snapshot carries the value. In a browser the stream is subscribed while the query is observed and the data stays for `gcTime` after the last release; there is no `staleTime`. An `error` keeps the last data in the error state, and `refetch()` or a new observer subscribes again; `complete` keeps the last value.

## Types

`RivaOptions` (what `createRiva` takes), `DataOperation` and `DataSource` (a `/_data` route's operations, from the main entry), `AddContextLast` and `ReservedKey` (the store's typing helpers, from `/store`). Each subpath exports its own types, listed in its [guide](./docs/README.md).

## Size budget

The main entry stays within 6144 B gzipped, with `entities` or `infinite` within 8192 B each, with `ssr` or `store` within 7680 B each, with `data` within 7168 B, with `resource` within 7680 B, with every subpath within 12288 B, core + react within 9216 B, core + `@softistx/riva/rxjs` within 7168 B (1024 B on top of the core, `rxjs` left out) (`bun run size` checks every row).

## Documentation

- [Guides](https://github.com/softistx/riva/blob/develop/packages/riva/docs/README.md): resources, signals, SSR, the shared-definitions guide and the rest.
- [Troubleshooting](https://github.com/softistx/riva/blob/develop/packages/riva/docs/troubleshooting.md): every error and its fix.
- [Roadmap](https://github.com/softistx/riva/blob/develop/docs/roadmap.md) and [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md).
