import { expect, test } from 'bun:test';
import {
	createRiva,
	query,
	type Riva,
	RivaScopeError,
	signal,
} from '@softistx/riva';
import { hydrate } from '@softistx/riva/ssr';
import { RouterContextProvider } from 'react-router';
import { riva, rivaContext, rivaOf } from './context';

test('rivaOf reads the request riva from the context', () => {
	const context = new RouterContextProvider();
	const riva = createRiva();
	context.set(rivaContext, riva);
	expect<unknown>(rivaOf(context)).toBe(riva); // registered in register.test.ts: typed by the app riva
});

test('rivaOf without the middleware throws a RivaScopeError naming the fix', () => {
	const context = new RouterContextProvider();
	let e: RivaScopeError | undefined;
	try {
		rivaOf(context);
	} catch (error) {
		e = error as RivaScopeError;
	}
	expect(e).toBeInstanceOf(RivaScopeError);
	expect(e?.code).toBe('RIVA_SCOPE');
	expect(e?.message).toBe(
		"No Riva in this request: add rivaMiddleware() from @softistx/riva-react-router/server to the root route's middleware.",
	);
});

test('riva() makes a spreadable payload holding a snapshot of the request riva', () => {
	const context = new RouterContextProvider();
	context.set(rivaContext, createRiva());
	const data = { ...riva(context), extra: 1 };
	expect(Object.keys(data)).toEqual(['~riva', 'extra']);
	expect(data['~riva']).toMatchObject({ v: 1, q: [], a: {} });
	expect(JSON.parse(JSON.stringify(data))['~riva'].v).toBe(1);
});

/** A request riva on a clock the spec moves, held by a router context. */
function request() {
	let now = 1_000_000;
	const r = createRiva({
		scheduler: {
			now: () => now,
			setTimeout: () => 0,
			clearTimeout: () => {},
		},
	});
	const context = new RouterContextProvider();
	context.set(rivaContext, r);
	return {
		r,
		context,
		tick: (ms: number) => {
			now += ms;
		},
	};
}

const item = query<{ id: number }, { n: number }>({
	id: 'item',
	retry: 0,
	fetch: async ({ id }) => ({ n: id }),
});
const shared = signal(0, { name: 'shared', ssr: true });
const keys = (data: { '~riva': unknown }) =>
	((data['~riva'] as { q: { k: string }[] }).q ?? []).map((e) => e.k);
const sig = (data: { '~riva': unknown }) =>
	(data['~riva'] as { a: Record<string, unknown> }).a;

test('a second riva() call of a request holds no entry the first already had', async () => {
	const { r, context } = request();
	await item.ensure(r, { id: 1 });
	const first = riva(context);
	const second = riva(context);
	expect(keys(first)).toEqual(['item:{"id":1}']);
	expect(keys(second)).toEqual([]);
	expect(second['~riva']).toMatchObject({ v: 1, q: [], a: {} });
});

test('an entry fetched between two calls appears only in the second', async () => {
	const { r, context } = request();
	await item.ensure(r, { id: 1 });
	const first = riva(context);
	await item.ensure(r, { id: 2 });
	const second = riva(context);
	expect(keys(first)).toEqual(['item:{"id":1}']);
	expect(keys(second)).toEqual(['item:{"id":2}']);
});

test('an entry refetched with new data between two calls appears in both', async () => {
	const { r, context, tick } = request();
	await item.ensure(r, { id: 1 });
	const first = riva(context);
	tick(50);
	item.setData(r, { id: 1 }, { n: 9 });
	const second = riva(context);
	expect(keys(first)).toEqual(['item:{"id":1}']);
	expect(keys(second)).toEqual(['item:{"id":1}']);
	expect(keys(riva(context))).toEqual([]);
});

test('a signal changed between two calls is re-emitted, an unchanged one is not', () => {
	const { r, context } = request();
	r.set(shared, 1);
	expect(sig(riva(context))).toEqual({ shared: 1 });
	expect(sig(riva(context))).toEqual({});
	r.set(shared, 2);
	expect(sig(riva(context))).toEqual({ shared: 2 });
});

test('two requests each emit in full', async () => {
	const a = request();
	const b = request();
	await item.ensure(a.r, { id: 1 });
	await item.ensure(b.r, { id: 1 });
	expect(keys(riva(a.context))).toEqual(['item:{"id":1}']);
	expect(keys(riva(b.context))).toEqual(['item:{"id":1}']);
});

test('a client riva hydrated from a root and a leaf payload holds all the data', async () => {
	const { r, context } = request();
	await item.ensure(r, { id: 1 });
	r.set(shared, 4);
	const root = JSON.parse(JSON.stringify(riva(context)));
	await item.ensure(r, { id: 2 });
	const leaf = JSON.parse(JSON.stringify(riva(context)));
	const client: Riva = createRiva();
	hydrate(client, root['~riva']);
	hydrate(client, leaf['~riva']);
	expect(await item.ensure(client, { id: 1 })).toEqual({ n: 1 });
	expect(await item.ensure(client, { id: 2 })).toEqual({ n: 2 });
	expect(client.get(shared)).toBe(4);
});

test('an entry whose invalidated flag changes between calls is re-emitted', async () => {
	const { r, context } = request();
	await item.ensure(r, { id: 1 });
	riva(context);
	item.invalidate(r, { id: 1 });
	const second = riva(context);
	expect(keys(second)).toEqual(['item:{"id":1}']);
	expect(second['~riva'].q[0]?.i).toBe(1);
});

test('an error entry is emitted once', async () => {
	const { r, context } = request();
	const failing = query<void, string>({
		id: 'failing',
		retry: 0,
		fetch: async () => {
			throw new Error('x');
		},
	});
	await failing.ensure(r).catch(() => {});
	expect(keys(riva(context))).toEqual(['failing:']);
	expect(keys(riva(context))).toEqual([]);
});

test('documented limit: an entry is sent once, so a dropped first payload is not redelivered', async () => {
	const { r, context } = request();
	await item.ensure(r, { id: 1 });
	riva(context); // a payload React Router then discards (the loader threw)
	expect(keys(riva(context))).toEqual([]);
});
