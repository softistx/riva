import { expect, test } from 'bun:test';
import { NetworkError } from '@softistx/httpyz';
import {
	createRiva,
	RivaAbortError,
	RivaError,
	RivaNetworkError,
	RivaScopeError,
} from '@softistx/riva';
import {
	apiOver,
	fakeTransport,
	httpWith,
	json,
	operations,
} from '../test/fixtures';
import { httpyzTransport } from './http-transport';
import { mutation, query } from './query';
import { provideRest } from './transport';

const wire = (handle: Parameters<typeof httpWith>[0]) => {
	const http = httpWith(handle);
	const api = apiOver(http);
	const riva = createRiva();
	provideRest(riva, httpyzTransport(http, api));
	return { riva, api, http };
};

test('a query runs end to end over a real httpyz client, and is cached by its variables', async () => {
	const seen: string[] = [];
	const { riva, api } = wire((r) => {
		seen.push(r.url);
		return json({ id: '7', number: 'F-7', total: 12 });
	});
	const invoice = query(api, 'get /invoices/{id}', { staleTime: '30s' });
	expect(invoice.id).toBe('get /invoices/{id}');
	expect(invoice.options.staleTime).toBe(30_000);
	const first = await invoice.ensure(riva, { param: { id: '7' } });
	expect(first).toEqual({ id: '7', number: 'F-7', total: 12 });
	await invoice.ensure(riva, { param: { id: '7' } });
	await invoice.ensure(riva, { param: { id: '8' } });
	expect(seen).toEqual([
		'http://api.test/invoices/7',
		'http://api.test/invoices/8',
	]);
});

test('a mutation posts its body and invalidates a query', async () => {
	let listCalls = 0;
	let posted: unknown;
	const { riva, api } = wire(async (r) => {
		if (r.method === 'POST') {
			posted = await r.json();
			return json({ id: '1', number: 'F-1', total: 5 }, 201);
		}
		listCalls++;
		return json({ items: [] });
	});
	const list = query(api, 'get /invoices');
	const create = mutation(api, 'post /invoices', { invalidates: [list] });
	expect(create.id).toBe('post /invoices');
	await list.ensure(riva, undefined);
	const created = await create.run(riva, {
		json: { number: 'F-1', total: 5 },
	});
	expect(created).toEqual({ id: '1', number: 'F-1', total: 5 });
	expect(posted).toEqual({ number: 'F-1', total: 5 });
	await list.ensure(riva, undefined);
	expect(listCalls).toBe(2);
});

test('aborting through a definition cancels the httpyz request', async () => {
	let reqSignal: AbortSignal | undefined;
	const { riva, api } = wire(
		(r) =>
			new Promise<Response>((_, reject) => {
				reqSignal = r.signal;
				r.signal.addEventListener('abort', () =>
					reject(new DOMException('aborted', 'AbortError')),
				);
			}),
	);
	const health = query(api, 'get /health', { retry: 0 });
	const ctl = new AbortController();
	const p = health.ensure(riva, undefined, { signal: ctl.signal });
	await Bun.sleep(5);
	ctl.abort();
	await expect(p).rejects.toBeInstanceOf(RivaAbortError);
	expect(reqSignal?.aborted).toBe(true);
});

test('the id may be replaced, for one route defined twice', () => {
	const { api } = wire(() => json({}));
	expect(query(api, 'get /health', { id: 'health/fast' }).id).toBe(
		'health/fast',
	);
	expect(mutation(api, 'post /invoices', { id: 'invoices/create' }).id).toBe(
		'invoices/create',
	);
});

test('a route the spec lacks, or of the wrong kind, is refused at definition time', () => {
	const { api } = wire(() => json({}));
	expect(() => query(api, 'get /nope' as never)).toThrow(
		'no OpenAPI operation at GET /nope',
	);
	expect(() => query(api, 'delete /invoices/{id}' as never)).toThrow(
		'mutation()',
	);
	expect(() => mutation(api, 'get /health' as never)).toThrow('query()');
	expect(() => query(api, 42 as never)).toThrow('is not a route');
});

test('a definition with no provideRest rejects naming it', async () => {
	const { api } = wire(() => json({}));
	await expect(
		query(api, 'get /health', { retry: 0 }).ensure(createRiva()),
	).rejects.toBeInstanceOf(RivaScopeError);
	await expect(
		query(api, 'get /health', { retry: 0 }).ensure(createRiva()),
	).rejects.toThrow(/provideRest/);
});

test('the fake transport receives the route, the variables and the signal', async () => {
	const { api } = wire(() => json({}));
	const calls: unknown[][] = [];
	const riva = createRiva();
	provideRest(
		riva,
		fakeTransport(async (route, input, init) => {
			calls.push([route, input, init.signal.aborted]);
			return { id: '1', number: 'F', total: 1 };
		}),
	);
	await query(api, 'get /invoices/{id}').ensure(riva, {
		param: { id: '1' },
	});
	expect(calls[0]?.[0]).toMatchObject({
		method: 'get',
		path: '/invoices/{id}',
		operationId: 'getInvoice',
		hasInput: true,
	});
	expect(calls[0]?.[1]).toEqual({ param: { id: '1' } });
	expect(calls[0]?.[2]).toBe(false);
});

test('a free fetcher is typed by its function, gets ctx.http, and has its httpyz errors mapped', async () => {
	const { riva, http } = wire(() => json({ q: 'x' }));
	const search = query({
		id: 'search',
		retry: 0,
		fetch: async (vars: { q: string }, ctx) => {
			expect(ctx.http).toBe(http);
			const reply = await ctx.http.get('/search', { query: vars });
			return (reply as { data: { q: string } }).data;
		},
	});
	expect(search.id).toBe('search');
	expect(await search.ensure(riva, { q: 'x' })).toEqual({ q: 'x' });
	const broken = query({
		id: 'broken',
		retry: 0,
		fetch: async () => {
			throw new NetworkError({ method: 'get', path: '/broken' });
		},
	});
	await expect(broken.ensure(riva)).rejects.toBeInstanceOf(RivaNetworkError);
	const down = mutation({
		id: 'down',
		run: async () => {
			throw new NetworkError({ method: 'post', path: '/down' });
		},
	});
	await expect(down.run(riva)).rejects.toBeInstanceOf(RivaNetworkError);
});

test('a free definition with no ctx.http riva says how to build the transport', async () => {
	const riva = createRiva();
	provideRest(riva, fakeTransport());
	const q = query({
		id: 'nohttp',
		retry: 0,
		fetch: async (_, ctx) => ctx.http,
	});
	await expect(q.ensure(riva)).rejects.toThrow(
		'holds no httpyz client: build it with httpyzTransport(http, api)',
	);
});

test('a free fetcher or mutation with no id throws a RivaError', () => {
	expect(() =>
		query({ fetch: async () => 1 } as unknown as Parameters<typeof query>[0]),
	).toThrow(RivaError);
	expect(() =>
		query({ fetch: async () => 1 } as unknown as Parameters<typeof query>[0]),
	).toThrow('query() needs an id');
	expect(() =>
		mutation({ run: async () => 1 } as unknown as Parameters<
			typeof mutation
		>[0]),
	).toThrow('mutation() needs an id');
});

test('a definition from the operations table alone has the same id and runs through the transport', async () => {
	const calls: unknown[] = [];
	const riva = createRiva();
	provideRest(
		riva,
		fakeTransport(async (route, vars) => {
			calls.push([route.operationId, vars]);
			return { id: '7', number: 'F-7', total: 1 };
		}),
	);
	const fromTable = query(operations, 'get /invoices/{id}');
	const { api } = wire(() => json({}));
	expect(fromTable.id).toBe(query(api, 'get /invoices/{id}').id);
	expect(mutation(operations, 'post /invoices').id).toBe('post /invoices');
	expect(query(operations, 'get /invoices/{id}', { id: 'inv/one' }).id).toBe(
		'inv/one',
	);
	await fromTable.ensure(riva, { param: { id: '7' } });
	expect(calls).toEqual([['getInvoice', { param: { id: '7' } }]]);
	await mutation(operations, 'post /invoices').run(riva, {
		json: { number: 'F-8', total: 2 },
	});
	expect(calls[1]).toEqual([
		'createInvoice',
		{ json: { number: 'F-8', total: 2 } },
	]);
});

test('the table form refuses an unknown route and a wrong kind at definition time', () => {
	expect(() => query(operations, 'get /nope' as never)).toThrow(RivaError);
	expect(() => query(operations, 'get /nope' as never)).toThrow(
		'no OpenAPI operation at GET /nope',
	);
	expect(() => query(operations, 'delete /invoices/{id}' as never)).toThrow(
		'mutation()',
	);
	expect(() => mutation(operations, 'get /health' as never)).toThrow('query()');
});

test('free options still define, and one without an id still throws', () => {
	const free = query({ id: 'free', fetch: async () => 1 });
	expect(free.id).toBe('free');
	expect(mutation({ id: 'free-m', run: async () => 1 }).id).toBe('free-m');
	expect(() => query({ fetch: async () => 1 } as never)).toThrow(
		'query() needs an id',
	);
	expect(() => mutation({ run: async () => 1 } as never)).toThrow(
		'mutation() needs an id',
	);
});
