import { expectTypeOf, test } from 'bun:test';
import type { Riva } from '../client';
import { createRiva } from '../client';
import type { Computed, ReadonlySignal } from '../computed';
import { mutation } from '../mutation';
import { query } from '../query';
import { store } from './store';
import type { Args, StoreContext, View } from './types';

interface Book {
	title: string;
}

const find = query<{ id: number }, Book>({
	id: 't/find',
	fetch: async () => ({ title: '' }),
});
const saveBook = mutation<{ book: Book }, Book>({
	id: 't/save',
	mutate: async (v) => v.book,
});

const Books = store({
	name: 'books',
	state: { items: [] as Book[], filter: '', saving: false },
	computed: {
		visible: (s) => {
			expectTypeOf(s).toEqualTypeOf<
				View<{ items: Book[]; filter: string; saving: boolean }>
			>();
			return s.items.filter((b) => b.title.includes(s.filter));
		},
		total: (s) => s.items.length,
	},
	actions: {
		add(s, book: Book) {
			expectTypeOf(s.items).toEqualTypeOf<Book[]>();
			expectTypeOf(s.total).toEqualTypeOf<number>();
			s.items = [...s.items, book];
			// @ts-expect-error a computed is read-only
			s.total = 1;
			// @ts-expect-error not a key of the store
			s.nope = 1;
			// @ts-expect-error the wrong type
			s.filter = 3;
		},
		clear(s) {
			s.items = [];
		},
		async save(s, book: Book, { mutate, fetch, riva }: StoreContext) {
			expectTypeOf(riva).toEqualTypeOf<Riva>();
			const saved = await mutate(saveBook, { book });
			expectTypeOf(saved).toEqualTypeOf<Book>();
			expectTypeOf(await fetch(find, { id: 1 })).toEqualTypeOf<Book>();
			s.items = [...s.items, saved];
			return saved.title.length;
		},
	},
});

test('state keys are read-only signals, computeds are computeds', () => {
	expectTypeOf(Books.items).toEqualTypeOf<ReadonlySignal<Book[]>>();
	expectTypeOf(Books.filter).toEqualTypeOf<ReadonlySignal<string>>();
	expectTypeOf(Books.visible).toEqualTypeOf<Computed<Book[]>>();
	expectTypeOf(Books.total).toEqualTypeOf<Computed<number>>();
	expectTypeOf(Books.name).toEqualTypeOf<'books'>();
	expectTypeOf(Books.kind).toEqualTypeOf<'store'>();
	expectTypeOf<ReturnType<typeof Books.items.get>>().toEqualTypeOf<Book[]>();
});

test('a state key is read with riva.get and cannot be set', () => {
	const c = createRiva();
	expectTypeOf(c.get(Books.items)).toEqualTypeOf<Book[]>();
	expectTypeOf(c.get(Books.total)).toEqualTypeOf<number>();
	const never = () => {
		// @ts-expect-error a state key is written by the store's actions only
		c.set(Books.items, []);
		// @ts-expect-error no setter on a state key
		Books.items.set([]);
	};
	expectTypeOf(never).toBeFunction();
});

test('actions are called without s and without the context', () => {
	expectTypeOf(Books.add).toEqualTypeOf<(book: Book) => void>();
	expectTypeOf(Books.clear).toEqualTypeOf<() => void>();
	expectTypeOf(Books.save).toEqualTypeOf<(book: Book) => Promise<number>>();
	const never = () => {
		// @ts-expect-error the argument is required
		Books.add();
		// @ts-expect-error the wrong type
		Books.add('x');
	};
	expectTypeOf(never).toBeFunction();
});

test('bind gives a read-only view of state and computeds, and the actions', () => {
	const [s, a] = Books.bind(createRiva());
	expectTypeOf(s.items).toEqualTypeOf<Book[]>();
	expectTypeOf(s.total).toEqualTypeOf<number>();
	expectTypeOf(a.add).toEqualTypeOf<(book: Book) => void>();
	const never = () => {
		// @ts-expect-error read-only
		s.filter = 'x';
	};
	expectTypeOf(never).toBeFunction();
});

test('Args drops a trailing StoreContext and keeps everything else', () => {
	expectTypeOf<Args<[number, string, StoreContext]>>().toEqualTypeOf<
		[number, string]
	>();
	expectTypeOf<Args<[StoreContext]>>().toEqualTypeOf<[]>();
	expectTypeOf<Args<[number, string]>>().toEqualTypeOf<[number, string]>();
	expectTypeOf<Args<[]>>().toEqualTypeOf<[]>();
	// an optional context is dropped too, and the optional arguments stay callable bare
	const call = (f: (...a: Args<[a?: number, ctx?: StoreContext]>) => void) => {
		f();
		f(1);
	};
	expectTypeOf(call).toBeFunction();
});

test('a computed reads other stores with get', () => {
	const Cart = store({
		name: 'cart',
		state: { price: 1 },
		computed: { due: (s, get) => s.price * get(Books.total) },
	});
	expectTypeOf(Cart.due).toEqualTypeOf<Computed<number>>();
});

test('the name is a literal type', () => {
	const S = store({ name: 'x', state: {} });
	expectTypeOf(S.name).toEqualTypeOf<'x'>();
});

test('Args strips an optional context too, and keeps an any last parameter', () => {
	expectTypeOf<Args<[a: number, ctx?: StoreContext]>>().toEqualTypeOf<
		[number]
	>();
	// biome-ignore lint/suspicious/noExplicitAny: an `any` is not a context
	expectTypeOf<Args<[a: number, b: any]>>().toEqualTypeOf<[number, any]>();
	const call = (
		f: (...a: Args<[a: number, b?: number, ctx?: StoreContext]>) => void,
	) => {
		f(1);
		f(1, 2);
		// @ts-expect-error the required argument
		f();
	};
	expectTypeOf(call).toBeFunction();
});

test('an action ending with an optional or defaulted parameter must declare ctx', () => {
	const S = store({
		name: 'ctxrule',
		state: { n: 0 },
		actions: {
			ok(s, by?: number, _ctx?: StoreContext) {
				s.n += by ?? 1;
			},
			okRequired(s, by: number | undefined) {
				s.n += by ?? 1;
			},
			// biome-ignore lint/suspicious/noExplicitAny: a typed-any last parameter
			loose(s, by: any) {
				s.n += by;
			},
			bad(s, by?: number) {
				s.n += by ?? 1;
			},
			badDefault(s, by = 1) {
				s.n += by;
			},
		},
	});
	expectTypeOf(S.ok).toEqualTypeOf<(by?: number) => void>();
	expectTypeOf(S.okRequired).toEqualTypeOf<(by: number | undefined) => void>();
	const never = () => {
		// @ts-expect-error the action needs `ctx?: StoreContext` last
		S.bad();
		// @ts-expect-error the action needs `ctx?: StoreContext` last
		S.badDefault();
	};
	expectTypeOf(never).toBeFunction();
});

test('a reserved key fails to type', () => {
	const never = () => {
		// @ts-expect-error `then` is reserved
		// biome-ignore lint/suspicious/noThenProperty: the reserved key under test
		store({ name: 'r1', state: { then: 1 } });
		// @ts-expect-error `kind` is reserved
		store({ name: 'r2', state: {}, actions: { kind() {} } });
	};
	expectTypeOf(never).toBeFunction();
});

test('a state key has no equals, no set', () => {
	expectTypeOf<keyof ReadonlySignal<number>>().not.toEqualTypeOf<
		keyof ReadonlySignal<number> | 'equals' | 'set'
	>();
	expectTypeOf<ReadonlySignal<number>>().not.toHaveProperty('equals');
	expectTypeOf<ReadonlySignal<number>>().not.toHaveProperty('set');
});
