# @softistx/riva

Core: signals, Riva, query and mutation engine, normalized and keyed cache, pagination, optimistic layer, dehydrate and hydrate. Pure TypeScript, no DOM, no React.

Work in progress, see the [spec](https://github.com/softistx/riva/blob/develop/docs/spec.md). Guides and fixes: [docs](./docs/README.md).

```sh
bun add @softistx/riva
```

Zero runtime dependencies. Definitions are stateless; values live in a `Riva`: one per request on the server, so values never leak between requests.

| Import | Holds | Guide |
| --- | --- | --- |
| `@softistx/riva` | `signal`, `computed`, `effect`, `batch`, `createRiva`, `query`, `mutation`, the errors | [signals](./docs/guide/signals.md), [queries](./docs/guide/queries.md), [mutations](./docs/guide/mutations.md), [errors](./docs/guide/errors.md) |
| `@softistx/riva/entities` | the normalized cache | [entities](./docs/guide/entities.md) |
| `@softistx/riva/infinite` | cursor pagination | [infinite](./docs/guide/infinite.md) |
| `@softistx/riva/store` | domain stores | [store](./docs/guide/store.md) |
| `@softistx/riva/ssr` | dehydrate, hydrate, scope resolver | [ssr](./docs/guide/ssr.md) |
| `@softistx/riva/data` | the browser's `/_data` riva | [data](./docs/guide/data.md) |

## Extensions

`createRiva` takes named extensions beside `scheduler` and `events`: any object with an `install(riva)` method (a `RivaExtension`). Its result is set once on the instance as `riva[name]`, fully typed. An adapter ships one; the core never imports it.

```ts
import { createRiva, type RivaExtension } from '@softistx/riva';

const clock: RivaExtension<{ now(): number }> = {
	install: () => ({ now: () => Date.now() }),
};

const riva = createRiva({ clock, defaults: { staleTime: '30s' } });
riva.clock.now(); // typed
```

`defaults.staleTime` applies to every query that sets no `staleTime` of its own. A name that is already a `Riva` member (`get`, `set`, `run`, …) cannot be an extension: a type error, and a `RIVA_DEFINITION` error at runtime.

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

## Queries

```ts
import { createRiva, query, RivaHttpError } from '@softistx/riva';

const user = query({
	id: 'user',
	staleTime: '30s', // "250ms" | "30s" | "5m" | "2h", or a number of ms
	fetch: async (vars: { id: string }, { signal }) => {
		const res = await fetch(`/api/users/${vars.id}`, { signal });
		if (!res.ok) throw new RivaHttpError(res.status);
		return (await res.json()) as { id: string; name: string };
	},
});

const riva = createRiva();
await user.ensure(riva, { id: '1' }); // fetch if missing or stale, else the cache
riva.get(user, { id: '1' }); // { status, data, error, isFetching, updatedAt }
riva.subscribe(user, { id: '1' }, (state) => console.log(state.status)); // fetches, polls, refetches on focus
user.invalidate(riva, { id: '1' }); // stale; refetches when observed
```

Options: `staleTime` (0), `gcTime` (5 min in a browser, `Infinity` on the server), `retry` (3 in a browser, 0 on the server), `retryDelay`, `refetchOnFocus`, `refetchOnReconnect`, `refetchEvery`, `cache`. One in-flight fetch per key. All of it, with `prefetch`, `setData`, `cancel` and abort: [queries](./docs/guide/queries.md).

## Mutations

```ts
import { createRiva, mutation, query } from '@softistx/riva';

const todos = query({ id: 'todos', fetch: async () => (await fetch('/api/todos')).json() as Promise<string[]> });

const addTodo = mutation<string, string>({
	id: 'addTodo',
	run: async (title, { signal }) => (await fetch('/api/todos', { method: 'POST', body: title, signal })).text(),
	optimistic: (title, tx) => tx.set(todos, undefined, (prev) => [...(prev ?? []), title]), // shown at once
	updates: (tx, saved) => tx.set(todos, undefined, (prev) => [...(prev ?? []), saved]), // on success
	invalidates: [todos], // marks stale; observed ones refetch
});

await addTodo.run(createRiva(), 'Buy milk'); // rejects, with the layer dropped, on failure
```

The optimistic layer, rollback, ordering and `cache: entities()`: [mutations](./docs/guide/mutations.md). Trap: after success the layer is dropped, so give the mutation `updates`, `invalidates` or `cache`.

## Normalized cache

```ts
import { entities, readEntity, writeEntity } from '@softistx/riva/entities';

const cache = entities({ keys: { Book: (b) => b['isbn'] as string } });
const patient = query({ id: 'patient', cache, fetch: fetchPatient }); // objects with __typename and id are stored once
writeEntity(riva, 'Patient:1', { name: 'Ann' }); // every query reaching it sees it
readEntity(riva, 'Patient:1');
```

`invalidateEntity`, `evict`, a codec of your own, and the traps (one set of identity rules per riva): [entities](./docs/guide/entities.md).

## Infinite lists

```ts
import { infinite } from '@softistx/riva/infinite';

const feed = infinite({
	id: 'patientsFeed',
	fetch: (v: { search: string; after?: string }) => fetchPage(v), // the library fills `after`
	connection: (page) => page.patients, // { edges, pageInfo }
});

await feed.ensure(riva, { search: 'a' });
await feed.fetchNext(riva, { search: 'a' });
riva.get(feed, { search: 'a' }).data?.nodes; // every loaded node
```

Refetch semantics, `fetchPrevious`, `cursor` names and writing to a feed: [infinite](./docs/guide/infinite.md).

## Stores

```ts
import { store, type StoreContext } from '@softistx/riva/store';

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

`RivaError` (with a `code`) is the base class, defined once here so `instanceof` holds. `RivaScopeError` (`RIVA_SCOPE`), `RivaRequestError` (`status?`, `retryable`), `RivaHttpError` (`HTTP_<status>`), `RivaNetworkError` (`RIVA_NETWORK`), `RivaAbortError` (`RIVA_ABORT`); `isRetryableStatus(status)` tells whether an HTTP status is worth retrying (5xx, 408, 429); `RIVA_CYCLE`, `RIVA_LOOP`, `RIVA_DURATION`, `RIVA_KEY`, `RIVA_CACHE`, `RIVA_STORE` and `RIVA_SSR` are plain `RivaError`s. [errors](./docs/guide/errors.md), [troubleshooting](./docs/troubleshooting.md).

## Data route riva

`@softistx/riva/data` is the browser's side of a `/_data` route, for a transport of your own: `postData(opts, id, variables, signal?)`. [data](./docs/guide/data.md).

## Types

`RivaOptions` (what `createRiva` takes), `DataOperation` and `DataSource` (a `/_data` route's operations, from the main entry), `AddContextLast` and `ReservedKey` (the store's typing helpers, from `/store`). Each subpath exports its own types, listed in its [guide](./docs/README.md).

## Size budget

The main entry stays within 6144 B gzipped, with `entities` or `infinite` within 8192 B each, with `ssr` or `store` within 7680 B each, with `data` within 7168 B, with every subpath within 12288 B, core + react within 9216 B (`bun run size` checks every row).
