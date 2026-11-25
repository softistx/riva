import { expectTypeOf, test } from 'bun:test';
import type { RivaClient } from '../client';
import { createRivaClient } from '../client';
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
	run: async (v) => v.book,
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
		async save(s, book: Book, { mutate, fetch, client }: StoreContext) {
			expectTypeOf(client).toEqualTypeOf<RivaClient>();
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
	expectTypeOf(Books.items.get()).toEqualTypeOf<Book[]>();
});

test('a state key is read with client.get and cannot be set', () => {
	const c = createRivaClient();
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
	const [s, a] = Books.bind(createRivaClient());
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
