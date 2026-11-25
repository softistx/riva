import { describe, expect, test } from 'bun:test';
import { fakeEnv, settle } from '../../test/ssr';
import { createRivaClient } from '../client';
import { computed } from '../computed';
import { effect } from '../effect';
import { RivaError, RivaScopeError } from '../errors';
import { mutation } from '../mutation';
import { query } from '../query';
import { signal } from '../signal';
import { dehydrate, hydrate } from '../ssr';
import { store } from './store';
import type { StoreContext } from './types';

interface Book {
	title: string;
}

const make = () =>
	store({
		name: 'books',
		state: { items: [] as Book[], filter: '', saving: false },
		computed: {
			visible: (s) => s.items.filter((b) => b.title.includes(s.filter)),
			total: (s) => s.items.length,
		},
		actions: {
			add(s, book: Book) {
				s.items = [...s.items, book];
			},
			addTwo(s, a: Book, b: Book) {
				s.items = [...s.items, a];
				s.items = [...s.items, b];
			},
			filterBy(s, q: string) {
				s.filter = q;
			},
		},
	});

const refusal = (fn: () => unknown, text: RegExp | string) => {
	try {
		fn();
	} catch (e) {
		expect(e).toBeInstanceOf(RivaError);
		expect((e as RivaError).code).toBe('RIVA_STORE');
		expect((e as RivaError).message).toMatch(text);
		return;
	}
	throw new Error('did not throw');
};

describe('definitions', () => {
	test('a state key is a signal named <name>.<key>, a computed a computed, the store is frozen', () => {
		const Books = make();
		expect(Books.kind).toBe('store');
		expect(Books.name).toBe('books');
		expect(Books.items.kind).toBe('signal');
		expect(Books.items.name).toBe('books.items');
		expect(Books.filter.name).toBe('books.filter');
		expect(Books.total.kind).toBe('computed');
		expect(Books.total.name).toBe('books.total');
		expect(Object.isFrozen(Books)).toBe(true);
	});

	test('a key used twice, or reserved, is refused at definition', () => {
		refusal(
			() =>
				store({
					name: 'x',
					state: { a: 1 },
					computed: { a: (s) => s.a },
				}),
			/"a" is taken/,
		);
		refusal(
			// @ts-expect-error a reserved key fails to type
			() => store({ name: 'x', state: { reset: 1 } }),
			/"reset" is taken/,
		);
		refusal(
			// @ts-expect-error a reserved key fails to type
			() => store({ name: 'x', state: {}, actions: { bind() {} } }),
			/"bind" is taken/,
		);
		refusal(
			// @ts-expect-error a reserved key fails to type
			// biome-ignore lint/suspicious/noThenProperty: the reserved key under test
			() => store({ name: 'x', state: { then: 1 } }),
			/"then" is taken/,
		);
	});

	test('a store with only state works', () => {
		const S = store({ name: 'only', state: { n: 1 } });
		expect(createRivaClient().get(S.n)).toBe(1);
	});
});

describe('reads', () => {
	test('state and computeds are read as definitions, per client', () => {
		const Books = make();
		const a = createRivaClient();
		const b = createRivaClient();
		a.run(() => Books.add({ title: 'x' }));
		expect(a.get(Books.items)).toEqual([{ title: 'x' }]);
		expect(a.get(Books.total)).toBe(1);
		expect(b.get(Books.total)).toBe(0);
		expect(a.run(() => Books.total.get())).toBe(1);
		expect(b.run(() => Books.items.get())).toEqual([]);
	});

	test('a computed tracks the state keys it reads and nothing else', () => {
		const Books = make();
		const c = createRivaClient();
		const runs: number[] = [];
		const off = c.subscribe(Books.total, (n) => runs.push(n));
		c.run(() => Books.filterBy('a'));
		expect(runs).toEqual([]);
		c.run(() => Books.add({ title: 'a' }));
		expect(runs).toEqual([1]);
		off();
	});

	test('a computed reads other stores through their definitions', () => {
		const Users = store({
			name: 'users',
			state: { vip: false },
			actions: {
				promote(s) {
					s.vip = true;
				},
			},
		});
		const Cart = store({
			name: 'cart',
			state: { price: 100 },
			computed: { due: (s, get) => s.price * (get(Users.vip) ? 0.9 : 1) },
		});
		const c = createRivaClient();
		const seen: number[] = [];
		c.subscribe(Cart.due, (n) => seen.push(n));
		expect(c.get(Cart.due)).toBe(100);
		Users.bind(c)[1].promote();
		expect(seen).toEqual([90]);
	});

	test('a computed cannot write', () => {
		const S = store({
			name: 'w',
			state: { a: 1 },
			computed: {
				bad: (s) => {
					(s as { a: number }).a = 2;
					return 1;
				},
			},
		});
		refusal(() => createRivaClient().get(S.bad), /computed cannot write "a"/);
	});

	test('a cycle across stores is refused with RIVA_CYCLE', () => {
		let B: { x: { kind: 'computed' } } & Record<string, unknown>;
		const A = store({
			name: 'a',
			state: {},
			computed: {
				x: (_s, get) => get((B as never as { y: never }).y) as number,
			},
		});
		B = store({
			name: 'b',
			state: {},
			computed: {
				x: (_s, get) => get(A.x) as number,
				y: (_s, get) => get(A.x) as number,
			},
		}) as never;
		try {
			createRivaClient().get(A.x);
			throw new Error('did not throw');
		} catch (e) {
			expect((e as RivaError).code).toBe('RIVA_CYCLE');
		}
	});
});

describe('writes', () => {
	test('only actions write: set, client.set and a computed key are refused', () => {
		const Books = make();
		const c = createRivaClient();
		// @ts-expect-error a state key has no setter in the types
		refusal(() => c.run(() => Books.items.set([])), /outside an action/);
		refusal(
			() => c.set(Books.filter as never, 'x'),
			/"filter" is written outside/,
		);
		expect(c.get(Books.filter)).toBe('');
		expect(c.get(Books.items)).toEqual([]);
	});

	test('a refused write notifies nobody and leaves the epoch alone', () => {
		const Books = make();
		const c = createRivaClient();
		const seen: unknown[] = [];
		c.subscribe(Books.filter, (v) => seen.push(v));
		const epoch = c.graph.epoch;
		expect(() => c.set(Books.filter as never, 'x')).toThrow();
		expect(seen).toEqual([]);
		expect(c.graph.epoch).toBe(epoch);
	});

	test('s refuses a computed key and an unknown key', () => {
		const S = store({
			name: 'k',
			state: { a: 1 },
			computed: { b: (s) => s.a },
			actions: {
				setB(s) {
					(s as unknown as { b: number }).b = 1;
				},
				setZ(s) {
					(s as unknown as { z: number }).z = 1;
				},
			},
		});
		const c = createRivaClient();
		refusal(() => S.bind(c)[1].setB(), /"b" is not a state key/);
		refusal(() => S.bind(c)[1].setZ(), /"z" is not a state key/);
	});

	test('the read view of bind is read-only', () => {
		const Books = make();
		const [s] = Books.bind(createRivaClient());
		expect(s.total).toBe(0);
		refusal(() => {
			(s as { filter: string }).filter = 'x';
		}, /read-only here/);
	});

	test('a function stored in state is a value, not an updater', () => {
		const fn = () => 1;
		const S = store({
			name: 'fn',
			state: { f: null as null | (() => number) },
			actions: {
				put(s) {
					s.f = fn;
				},
			},
		});
		const c = createRivaClient();
		S.bind(c)[1].put();
		expect(c.get(S.f)).toBe(fn);
	});

	test('a nested mutation is refused in dev: stored values are frozen', () => {
		const Books = make();
		const c = createRivaClient();
		Books.bind(c)[1].add({ title: 'a' });
		const items = c.get(Books.items);
		expect(Object.isFrozen(items)).toBe(true);
		expect(() => (items as Book[]).push({ title: 'b' })).toThrow();
		expect(() => {
			(items[0] as Book).title = 'z';
		}).toThrow();
	});

	test('the initial state is frozen too', () => {
		const S = store({ name: 'init', state: { list: [{ n: 1 }] } });
		expect(Object.isFrozen(S.list.initial)).toBe(true);
		expect(Object.isFrozen(S.list.initial[0])).toBe(true);
	});
});

describe('actions', () => {
	test('one call gives one notification, however many writes', () => {
		const Books = make();
		const c = createRivaClient();
		const seen: number[] = [];
		c.subscribe(Books.total, (n) => seen.push(n));
		const [, a] = Books.bind(c);
		a.addTwo({ title: 'a' }, { title: 'b' });
		expect(seen).toEqual([2]);
	});

	test('the ambient form resolves the client, and throws RIVA_SCOPE on the server with none', () => {
		const Books = make();
		expect(() => Books.add({ title: 'a' })).toThrow(RivaScopeError);
		const c = createRivaClient();
		c.run(() => Books.add({ title: 'a' }));
		expect(c.get(Books.total)).toBe(1);
	});

	test('bind caches the instance: the actions keep their identity per client', () => {
		const Books = make();
		const c = createRivaClient();
		const d = createRivaClient();
		expect(Books.bind(c)[1]).toBe(Books.bind(c)[1]);
		expect(Books.bind(c)[0]).toBe(Books.bind(c)[0]);
		expect(Books.bind(d)[1]).not.toBe(Books.bind(c)[1]);
	});

	test('a sync action returns its value, and its error leaves no batch open', () => {
		const S = store({
			name: 'ret',
			state: { n: 0 },
			actions: {
				next(s) {
					s.n += 1;
					return s.n;
				},
				boom(s) {
					s.n = 99;
					throw new Error('boom');
				},
			},
		});
		const c = createRivaClient();
		const [, a] = S.bind(c);
		expect(a.next()).toBe(1);
		expect(() => a.boom()).toThrow('boom');
		expect(c.graph.depth).toBe(0);
		expect(c.get(S.n)).toBe(99);
	});

	test('an action reads computeds through s', () => {
		const S = store({
			name: 'rc',
			state: { n: 2 },
			computed: { twice: (s) => s.n * 2 },
			actions: {
				grow(s) {
					s.n = s.twice;
				},
			},
		});
		const c = createRivaClient();
		S.bind(c)[1].grow();
		expect(c.get(S.n)).toBe(4);
	});

	test('a read made through s is not tracked by an outer effect', () => {
		const Books = make();
		const c = createRivaClient();
		let runs = 0;
		const off = c.effect(() => {
			runs++;
			Books.bind(c)[1].add({ title: 'a' });
		});
		expect(runs).toBe(1);
		Books.bind(c)[1].filterBy('z');
		Books.bind(c)[1].add({ title: 'b' });
		expect(runs).toBe(1);
		off();
	});
});

describe('async actions', () => {
	const ping = query<{ id: number }, string>({
		id: 'store/ping',
		fetch: async ({ id }) => `v${id}`,
		retry: 0,
	});
	const save = mutation<{ title: string }, Book>({
		id: 'store/save',
		run: async (v) => ({ title: v.title }),
	});

	const make2 = (gate?: Promise<void>) =>
		store({
			name: 'async',
			state: { items: [] as Book[], saving: false, got: '' },
			actions: {
				async save(s, title: string, { mutate }: StoreContext) {
					s.saving = true;
					const saved = await mutate(save, { title });
					s.items = [...s.items, saved];
					s.saving = false;
				},
				async load(s, id: number, { fetch, client }: StoreContext) {
					s.got = await fetch(ping, { id });
					return client;
				},
				async slow(s, _ctx?: StoreContext) {
					await gate;
					s.got = 'one';
					s.saving = true;
				},
			},
		});

	test('s stays bound to its client across await, with no ambient scope', async () => {
		const S = make2();
		const c = createRivaClient();
		await S.bind(c)[1].save('x');
		expect(c.get(S.items)).toEqual([{ title: 'x' }]);
		expect(c.get(S.saving)).toBe(false);
		expect(() => S.items.get()).toThrow(RivaScopeError);
	});

	test('ctx carries the client, fetch and mutate; ctx.fetch uses the cache', async () => {
		const S = make2();
		const c = createRivaClient();
		const client = await S.bind(c)[1].load(3);
		expect(client).toBe(c);
		expect(c.get(S.got)).toBe('v3');
	});

	test('each synchronous segment is one notification', async () => {
		const S = make2();
		const c = createRivaClient();
		const seen: string[] = [];
		c.subscribe(S.saving, (v) => seen.push(`saving=${v}`));
		c.subscribe(S.items, (v) => seen.push(`items=${v.length}`));
		const p = S.bind(c)[1].save('x');
		expect(seen).toEqual(['saving=true']);
		await p;
		// the segment after the await writes items and saving together
		expect(seen).toEqual(['saving=true', 'items=1', 'saving=false']);
	});

	test('the writes of a post-await segment notify once, after it', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const S = make2(gate);
		const c = createRivaClient();
		const total = computed((get) => `${get(S.got)}/${get(S.saving)}`);
		const seen: string[] = [];
		c.subscribe(total, (v) => seen.push(v));
		const p = S.bind(c)[1].slow();
		release();
		await p;
		await settle();
		expect(seen).toEqual(['one/true']);
		expect(c.graph.depth).toBe(0);
	});

	test('a listener error in the post-await flush rejects the action, and the depth is back', async () => {
		const S = store({
			name: 'lerr',
			state: { n: 0 },
			actions: {
				async go(s) {
					await Promise.resolve();
					s.n = 1;
				},
				async later(s) {
					await Promise.resolve();
					s.n = 2;
					await new Promise((r) => setTimeout(r, 5));
				},
			},
		});
		const c = createRivaClient();
		c.subscribe(S.n, () => {
			throw new Error('boom');
		});
		await expect(S.bind(c)[1].go()).rejects.toThrow('boom');
		expect(c.graph.depth).toBe(0);
		await expect(S.bind(c)[1].later()).rejects.toThrow('boom');
		expect(c.graph.depth).toBe(0);
		expect(c.get(S.n)).toBe(2);
	});

	test('s is revoked once the action settles: writes throw, reads work', async () => {
		let kept!: { got: string };
		const S = store({
			name: 'rev',
			state: { got: 'a' },
			actions: {
				async run(s, _c?: StoreContext) {
					kept = s as { got: string };
					await null;
					s.got = 'b';
				},
			},
		});
		const c = createRivaClient();
		await S.bind(c)[1].run();
		expect(kept.got).toBe('b');
		refusal(() => {
			kept.got = 'c';
		}, /after its action settled/);
	});

	test('s is revoked after a rejection too, and the error propagates', async () => {
		let kept!: { n: number };
		const S = store({
			name: 'rej',
			state: { n: 0 },
			actions: {
				async fail(s) {
					kept = s;
					await null;
					throw new Error('nope');
				},
			},
		});
		const c = createRivaClient();
		await expect(S.bind(c)[1].fail()).rejects.toThrow('nope');
		refusal(() => {
			kept.n = 1;
		}, /after its action settled/);
	});

	test('the context lands after the declared arguments, optional ones padded', async () => {
		const seen: unknown[][] = [];
		const S = store({
			name: 'pad',
			state: {},
			actions: {
				act(_s, a?: number, b?: number, ctx?: StoreContext) {
					seen.push([a, b, ctx?.client]);
				},
			},
		});
		const c = createRivaClient();
		const [, a] = S.bind(c);
		a.act();
		a.act(1);
		a.act(1, 2);
		expect(seen).toEqual([
			[undefined, undefined, c],
			[1, undefined, c],
			[1, 2, c],
		]);
	});

	test('reset during an async action: its later writes still apply', async () => {
		const S = make2();
		const c = createRivaClient();
		const p = S.bind(c)[1].save('x');
		S.reset(c);
		await p;
		expect(c.get(S.items)).toEqual([{ title: 'x' }]);
	});
});

describe('reset', () => {
	test('puts every state key back to its initial value, in one notification', () => {
		const Books = make();
		const c = createRivaClient();
		const [, a] = Books.bind(c);
		a.add({ title: 'a' });
		a.filterBy('a');
		const seen: number[] = [];
		c.subscribe(Books.total, (n) => seen.push(n));
		const both = computed((get) => `${get(Books.total)}${get(Books.filter)}`);
		const bs: string[] = [];
		c.subscribe(both, (v) => bs.push(v));
		c.run(() => Books.reset());
		expect(c.get(Books.items)).toBe(Books.items.initial);
		expect(c.get(Books.filter)).toBe('');
		expect(seen).toEqual([0]);
		expect(bs).toEqual(['0']);
	});

	test('the ambient reset needs a client, an explicit one does not', () => {
		const Books = make();
		expect(() => Books.reset()).toThrow(RivaScopeError);
		const c = createRivaClient();
		Books.bind(c)[1].filterBy('z');
		Books.reset(c);
		expect(c.get(Books.filter)).toBe('');
	});

	test('a state holding a function resets to it', () => {
		const f = () => 2;
		const S = store({
			name: 'rf',
			state: { f },
			actions: {
				clear(s) {
					s.f = () => 3;
				},
			},
		});
		const c = createRivaClient();
		S.bind(c)[1].clear();
		S.reset(c);
		expect(c.get(S.f)).toBe(f);
	});
});

describe('isolation and names', () => {
	test('two clients keep their own values', () => {
		const Books = make();
		const a = createRivaClient();
		const b = createRivaClient();
		Books.bind(a)[1].filterBy('a');
		expect(a.get(Books.filter)).toBe('a');
		expect(b.get(Books.filter)).toBe('');
	});

	test('a second store with a name on a client is refused, in another client it is fine', () => {
		const one = store({ name: 'dup', state: { a: 1 } });
		const two = store({ name: 'dup', state: { b: 1 } });
		const c = createRivaClient();
		one.bind(c);
		refusal(
			() => two.bind(c),
			/Store "dup": two stores are named "dup" on this client/,
		);
		two.bind(createRivaClient());
		one.bind(c);
	});

	test('in a browser a newer store with the same name takes over', () => {
		const g = globalThis as { document?: unknown };
		const one = store({ name: 'hmr', state: { a: 1 } });
		const two = store({ name: 'hmr', state: { b: 2 } });
		const c = createRivaClient();
		one.bind(c);
		g.document = {};
		try {
			two.bind(c);
			expect(c.get(two.b)).toBe(2);
			// the old definition is dropped, and claims the name back when used again
			one.bind(c);
			expect(c.get(one.a)).toBe(1);
		} finally {
			delete g.document;
		}
	});

	test('effects see the store like any signal', () => {
		const Books = make();
		const c = createRivaClient();
		const seen: number[] = [];
		const off = c.effect(() => {
			seen.push(c.get(Books.total));
		});
		Books.bind(c)[1].add({ title: 'a' });
		expect(seen).toEqual([0, 1]);
		off();
		void effect;
	});
});

describe('ssr', () => {
	const build = (ssr?: boolean) =>
		store({
			name: 'books',
			...(ssr === undefined ? {} : { ssr }),
			state: { items: [] as Book[], filter: '' },
			computed: { total: (s) => s.items.length },
			actions: {
				add(s, b: Book) {
					s.items = [...s.items, b];
				},
			},
		});

	test('with ssr: true every state key travels as <name>.<key>, computeds do not', () => {
		const S = build(true);
		const server = createRivaClient();
		S.bind(server)[1].add({ title: 'a' });
		server.get(S.filter);
		server.get(S.total);
		const snap = dehydrate(server);
		expect(Object.keys(snap.a)).toEqual(['books.items']);
	});

	test('by default nothing travels', () => {
		const S = build();
		const server = createRivaClient();
		S.bind(server)[1].add({ title: 'a' });
		expect(dehydrate(server).a).toEqual({});
	});

	test('a reset store does not travel', () => {
		const S = build(true);
		const server = createRivaClient();
		S.bind(server)[1].add({ title: 'a' });
		S.reset(server);
		expect(dehydrate(server).a).toEqual({});
	});

	test('the snapshot seeds a store first used after hydrate, with no write', () => {
		const S = build(true);
		const server = createRivaClient();
		S.bind(server)[1].add({ title: 'a' });
		const snap = JSON.parse(JSON.stringify(dehydrate(server)));
		const browser = createRivaClient();
		hydrate(browser, snap);
		expect(browser.get(S.items)).toEqual([{ title: 'a' }]);
		expect(browser.get(S.total)).toBe(1);
		browser.graph.epoch; // no refusal: seeding is not a write
	});

	test('a hydrated value is frozen once the store is used (dev)', () => {
		const S = build(true);
		const server = createRivaClient();
		S.bind(server)[1].add({ title: 'a' });
		const browser = createRivaClient();
		hydrate(browser, JSON.parse(JSON.stringify(dehydrate(server))));
		S.bind(browser);
		const items = browser.get(S.items);
		expect(Object.isFrozen(items)).toBe(true);
		expect(Object.isFrozen(items[0])).toBe(true);
	});

	test('a store already in use on the browser is not overwritten by hydrate', () => {
		const S = build(true);
		const server = createRivaClient();
		S.bind(server)[1].add({ title: 'a' });
		const snap = dehydrate(server);
		const browser = createRivaClient();
		browser.get(S.items);
		hydrate(browser, snap);
		expect(browser.get(S.items)).toEqual([]);
	});
});

describe('with a fake clock', () => {
	test('ctx.fetch goes through the query cache', async () => {
		const { client: mk } = fakeEnv();
		const calls: number[] = [];
		const q = query<void, number>({
			id: 'store/cached',
			fetch: async () => {
				calls.push(1);
				return 7;
			},
			staleTime: 60_000,
		});
		const S = store({
			name: 'cached',
			state: { n: 0 },
			actions: {
				async go(s, { fetch }: StoreContext) {
					s.n = await fetch(q);
				},
			},
		});
		const c = mk();
		await S.bind(c)[1].go();
		await S.bind(c)[1].go();
		expect(calls).toEqual([1]);
		expect(c.get(S.n)).toBe(7);
		void signal;
	});
});
