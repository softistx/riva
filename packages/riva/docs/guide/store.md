# Stores: `@softistx/riva/store`

One definition per domain groups its state, computeds and actions. Every state key is a signal named `<name>.<key>` and every computed a riva computed, so both are read as definitions (`.get()`, `riva.get()`, `useValue()`). Like any definition, a store is stateless: its values live per `Riva`, one instance per riva.

```ts
import { createRiva, mutation } from '@softistx/riva';
import { store, type StoreContext } from '@softistx/riva/store';

const saveBook = mutation<{ book: Book }, Book>({ id: 'saveBook', mutate: postBook });

export const BookStore = store({
	name: 'books', // required, unique on a riva; prefixes the signal names
	ssr: true, // every state key travels in an SSR snapshot (default false)
	state: { items: [] as Book[], filter: '', saving: false },
	computed: {
		visible: (s) => s.items.filter((b) => b.title.includes(s.filter)), // s: the state, tracked per key
		total: (s) => s.items.length,
		discount: (s, get) => (get(UserStore.vip) ? 0.1 : 0), // other stores through their definitions
	},
	actions: {
		add(s, book: Book) {
			s.items = [...s.items, book]; // top-level assignment; one call, one notification
		},
		filterBy(s, q: string) {
			s.filter = q;
		},
		async save(s, book: Book, { mutate }: StoreContext) {
			s.saving = true;
			const saved = await mutate(saveBook, { book });
			s.items = [...s.items, saved];
			s.saving = false;
		},
	},
});

const riva = createRiva();
riva.get(BookStore.visible); // explicit riva
riva.run(() => {
	BookStore.total.get(); // ambient read
	BookStore.add(book); // an action, on the ambient riva
	BookStore.reset(); // every state key back to its initial value
});
const [s, a] = BookStore.bind(riva); // a read-only view of state and computeds, and the actions
await a.save(book); // `s` stays bound to `riva` across the await
```

## Options of `store(opts)`

| Option | Default | Effect |
| --- | --- | --- |
| `name` | required | Unique on a riva; prefixes the signal names. |
| `ssr` | `false` | Every state key travels as `<name>.<key>` in an SSR snapshot (computeds never do). |
| `state` | required | The initial state, by key. |
| `computed` | none | `{ key: (s, get) => value }`. |
| `actions` | none | `{ key: (s, ...args, ctx) => … }`. |

## Writing

- **Only actions write**, by top-level assignment on `s`. A state key is typed `ReadonlySignal` (no `set`), and a write made any other way (`BookStore.items.set(…)`, `riva.set(BookStore.items, …)`, a computed, an unknown key) throws `RIVA_STORE`. The exceptions are `hydrate` and `reset()`.
- Values are immutable: replace them (`s.items = [...s.items, b]`). In development (`process.env.NODE_ENV` not `production`) a stored value is deep-frozen, so `s.items.push(b)` throws, a hydrated value too.
- **Batched.** Every action runs in a batch: one call, one notification. After an `await`, the writes of one synchronous segment make one notification at its end; unrelated writes made on that riva in that segment are held until then.
- `s` is revoked once the action settles: a later write throws `RIVA_STORE`, reads still work.

## The context

An action is `(s, ...args, ctx)`; callers pass only `args`. Annotating `ctx: StoreContext` is mandatory: it types the context and removes it from the callers' signature. `StoreContext` is `{ riva, fetch, mutate }`, where `fetch(query, vars?)` is `query.ensure(riva, …)` and `mutate(mutation, vars?)` is `mutation.mutate(riva, …)`.

The context goes right after the declared arguments: a default value before it moves it. **An action whose last parameter is optional or defaulted must also declare `ctx?: StoreContext` last** (`inc(s, by?: number, ctx?: StoreContext)`): without it the context lands in that parameter, and the action fails to type.

## Computeds

They receive `(s, get)`: `s` holds the state only (no other computed), `get(def)` reads any other definition, another store's included. A cycle is refused with `RIVA_CYCLE`.

## Names

`name` is required. A state, computed or action key cannot repeat, nor be `kind`, `name`, `reset`, `bind` or `then` (refused at definition, and a type error). Two stores with one name on a riva are refused with `RIVA_STORE` on the server when the second is first used; in a browser the newer definition takes over (hot reload) and the older one is dropped from that riva. Only former holders are remembered: a definition that was never the holder (first read after two newer ones exist) cannot be told from a newer module and takes the name back once.

## `reset` and SSR

- `reset(riva?)` puts every state key back to its initial value (the same reference, so the key no longer travels in a snapshot) in one notification. A write an async action makes after the reset still applies.
- With `ssr: true` every state key travels; by default nothing does. A snapshot seeds a store first used after `hydrate` (see [ssr](./ssr.md)).

## Traps

- Mutating in place (`s.items.push`) throws in development and silently skips the notification in production: always assign a new value.
- The deep signals (per-path reactivity on nested state) and store families (one instance per key) come later.

Exports: `store`; types `Store`, `StoreOptions`, `StoreContext`, `Action`, `Args`, `Bound`, `View`. `ReadonlySignal` comes from the main entry. In React, `useStore` is in `@softistx/riva-react/store`.
