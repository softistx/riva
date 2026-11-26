import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	test,
} from 'bun:test';
import { createRiva, RivaHttpError, signal } from '@softistx/riva';
import type {
	MutationHandle,
	MutationState,
	Resource,
	ResourceState,
} from '@softistx/riva/resource';
import {
	apiOver,
	type Handler,
	httpWith,
	type Invoice,
	json,
} from '../test/fixtures';
import { query } from './query';
import { rest } from './simple';

const g = globalThis as { document?: unknown };
beforeEach(() => {
	g.document = {};
});
afterEach(() => {
	delete g.document;
});
const tick = () => new Promise<void>((r) => setTimeout(r, 5));

const inv = (id: string): Invoice => ({ id, number: `N${id}`, total: 10 });

/** A server over the invoices spec; records `METHOD path?query`. */
function server() {
	const seen: string[] = [];
	const handle: Handler = async (req) => {
		const u = new URL(req.url);
		seen.push(`${req.method} ${u.pathname}${u.search}`);
		if (req.method === 'POST')
			return json({ ...inv('9'), ...(await req.json()) }, 201);
		if (req.method === 'DELETE') return new Response(null, { status: 204 });
		if (u.pathname === '/invoices') return json({ items: [inv('1')] });
		if (u.pathname === '/health') return json({ ok: true });
		const id = u.pathname.split('/')[2] ?? '';
		return id === 'missing' ? json({ title: 'gone' }, 404) : json(inv(id));
	};
	const api = apiOver(httpWith(handle));
	return { seen, riva: createRiva({ rest: rest(api) }), api };
}

describe('riva.rest.get (typed)', () => {
	test('awaits the data, caches and dedupes by path and input', async () => {
		const { riva, seen } = server();
		const [a, b] = await Promise.all([
			riva.rest.get('/invoices/{id}', { param: { id: '1' } }),
			riva.rest.get('/invoices/{id}', { param: { id: '1' } }),
		]);
		expect(a).toEqual(inv('1'));
		expect(b).toBe(a);
		expect(seen).toEqual(['GET /invoices/1']);
		await riva.rest.get('/invoices/{id}', { param: { id: '2' } });
		expect(await riva.rest.get('/health')).toEqual({ ok: true });
		expect(await riva.rest.get('/invoices', { query: { page: 2 } })).toEqual({
			items: [inv('1')],
		});
		expect(seen).toContain('GET /invoices?page=2');
	});

	test('a per-call staleTime keeps the data fresh', async () => {
		const { riva, seen } = server();
		await riva.rest.get('/health');
		await riva.rest.get('/health', undefined, { staleTime: '1m' });
		expect(seen).toHaveLength(1);
		await riva.rest.get('/health');
		expect(seen).toHaveLength(2);
	});

	test('tracked input: a signal or a function re-derives the key and keeps the previous data', async () => {
		const { riva, seen } = server();
		const id = signal('1');
		const r = riva.rest.get('/invoices/{id}', () => ({
			param: { id: riva.get(id) },
		}));
		const states: ResourceState<Invoice>[] = [];
		const off = r.subscribe((s) => states.push(s));
		await tick();
		expect(r.state).toMatchObject({ status: 'success', data: inv('1') });
		riva.set(id, '2');
		expect(r.state).toMatchObject({ placeholder: true, isFetching: true });
		await tick();
		expect(r.state).toMatchObject({
			status: 'success',
			data: inv('2'),
			placeholder: false,
		});
		off();
		expect(seen).toEqual(['GET /invoices/1', 'GET /invoices/2']);
		const s = signal({ param: { id: '3' } });
		expect(await riva.rest.get('/invoices/{id}', s)).toEqual(inv('3'));
	});

	test('enabled false is idle, does not evaluate the input and does not fetch', async () => {
		const { riva, seen } = server();
		const on = signal(false);
		let evaluated = 0;
		const r = riva.rest.get(
			'/invoices/{id}',
			() => {
				evaluated++;
				return { param: { id: '1' } };
			},
			{ enabled: () => riva.get(on) },
		);
		const off = r.subscribe(() => {});
		await tick();
		expect(r.state.status).toBe('idle');
		expect(evaluated).toBe(0);
		expect(seen).toHaveLength(0);
		riva.set(on, true);
		await tick();
		expect(r.state.status).toBe('success');
		off();
	});

	test('an HTTP failure is a RivaHttpError, in the state and on await', async () => {
		const { riva } = server();
		const r = riva.rest.get('/invoices/{id}', { param: { id: 'missing' } });
		const e = await r.then(undefined, (x) => x);
		expect(e).toBeInstanceOf(RivaHttpError);
		expect(e.status).toBe(404);
		const off = r.subscribe(() => {});
		await tick();
		expect(r.state.status).toBe('error');
		expect(r.state.error).toBeInstanceOf(RivaHttpError);
		off();
	});

	test('its signal stops the wait', async () => {
		const { riva } = server();
		const ctl = new AbortController();
		ctl.abort();
		await expect(
			Promise.resolve(
				riva.rest.get('/health', undefined, { signal: ctl.signal }),
			),
		).rejects.toBeInstanceOf(Error);
	});

	test('refuses a route the spec lacks, or that is not a read', async () => {
		const { riva } = server();
		const bad = riva.rest as unknown as {
			get(p: string): PromiseLike<unknown>;
			post(p: string): Promise<unknown>;
		};
		expect(() => bad.get('/nope')).toThrow('no operation at GET /nope');
		await expect(bad.post('/health')).rejects.toThrow(
			'no operation at POST /health',
		);
	});

	test('memoised per riva, isolated between rivas, and beside hand-made definitions', async () => {
		const { api, seen } = server();
		const ext = rest(api);
		const a = createRiva({ rest: ext });
		const b = createRiva({ rest: ext });
		await a.rest.get('/health', undefined, { staleTime: '1m' });
		await a.rest.get('/health', undefined, { staleTime: '1m' });
		expect(seen).toHaveLength(1);
		await b.rest.get('/health', undefined, { staleTime: '1m' });
		expect(seen).toHaveLength(2);
		const own = query(api, 'get /health', { staleTime: '1m' });
		await own.ensure(a);
		expect(seen).toHaveLength(3);
	});
});

describe('riva.rest mutations (typed)', () => {
	test('post / delete resolve with the data and invalidate by path', async () => {
		const { riva, seen } = server();
		await riva.rest.get('/invoices', undefined, { staleTime: '1h' });
		const created = await riva.rest.post(
			'/invoices',
			{ json: { number: 'X', total: 5 } },
			{ invalidates: ['/invoices'] },
		);
		expect(created).toMatchObject({ number: 'X', total: 5 });
		await riva.rest.get('/invoices', undefined, { staleTime: '1h' });
		expect(seen).toEqual(['GET /invoices', 'POST /invoices', 'GET /invoices']);
		expect(
			await riva.rest.delete('/invoices/{id}', { param: { id: '1' } }),
		).toBeUndefined();
	});

	test('an unknown invalidated path throws before the mutation runs', async () => {
		const { riva, seen } = server();
		await expect(
			riva.rest.post(
				'/invoices',
				{ json: { number: 'X', total: 1 } },
				{
					invalidates: ['/nope'],
				},
			),
		).rejects.toThrow('no operation at GET /nope');
		expect(seen).toHaveLength(0);
	});

	test('mutation() is a handle: idle, loading, success, reset', async () => {
		const { riva } = server();
		const save = riva.rest.mutation('post', '/invoices');
		const states: string[] = [];
		save.subscribe((s: MutationState<Invoice>) => states.push(s.status));
		expect(save.state.status).toBe('idle');
		const out = await save({ json: { number: 'Y', total: 2 } });
		expect(out).toMatchObject({ number: 'Y' });
		expect(states).toEqual(['loading', 'success']);
		save.reset();
		expect(save.state.status).toBe('idle');
		expect(() =>
			(riva.rest as never as { mutation(m: string, p: string): void }).mutation(
				'post',
				'/nope',
			),
		).toThrow('no operation');
	});
});

describe('rest({ baseUrl }) (untyped)', () => {
	function plain() {
		const seen: string[] = [];
		const riva = createRiva({
			rest: rest({
				baseUrl: 'http://api.test',
				fetch: async (r) => {
					seen.push(
						`${r.method} ${new URL(r.url).pathname}${new URL(r.url).search}`,
					);
					return json(r.method === 'POST' ? { id: 'n' } : { id: 'a', n: 1 });
				},
			}),
		});
		return { riva, seen };
	}

	test('get<T>(url) with param and query, post and invalidates by URL', async () => {
		const { riva, seen } = plain();
		const a = await riva.rest.get<{ id: string; n: number }>('/things/{id}', {
			param: { id: 'a' },
			query: { x: 1 },
		});
		expect(a.n).toBe(1);
		await riva.rest.get('/things', undefined, { staleTime: '1h' });
		await riva.rest.post(
			'/things',
			{ json: { a: 1 } },
			{ invalidates: ['/things'] },
		);
		await riva.rest.get('/things', undefined, { staleTime: '1h' });
		expect(seen).toEqual([
			'GET /things/a?x=1',
			'GET /things',
			'POST /things',
			'GET /things',
		]);
	});

	test('the reads and the mutations are told apart', async () => {
		const { riva } = plain();
		const bad = riva.rest as unknown as {
			mutation(m: string, p: string): unknown;
		};
		expect(() => bad.mutation('get', '/x')).toThrow('is not a mutation');
		expect(riva.rest.mutation('put', '/x')).toBeDefined();
	});
});

describe('types', () => {
	test('the typed table gives paths, inputs and data', () => {
		const { riva } = server();
		const r = riva.rest.get('/invoices/{id}', { param: { id: '1' } });
		expectTypeOf(r).toEqualTypeOf<Resource<Invoice>>();
		expectTypeOf(riva.rest.get('/health')).toEqualTypeOf<
			Resource<{ ok: boolean }>
		>();
		expectTypeOf(
			riva.rest.post('/invoices', { json: { number: 'a', total: 1 } }),
		).toEqualTypeOf<Promise<Invoice>>();
		expectTypeOf(riva.rest.mutation('post', '/invoices')).toEqualTypeOf<
			MutationHandle<
				{ json: { number: string; total: number } },
				Invoice,
				import('./calls').MutateCall
			>
		>();
		// Never run: the errors are the compiler's.
		const _refused = () => {
			// @ts-expect-error not a path of the spec
			riva.rest.get('/nope');
			// @ts-expect-error a post is not a get path
			riva.rest.get('/invoices/{id}', { param: { id: 1 } });
			// @ts-expect-error the input is required
			riva.rest.get('/invoices/{id}');
			// @ts-expect-error a GET path is not a mutation
			riva.rest.mutation('post', '/health');
		};
		expect(_refused).toBeDefined();
	});

	test('baseUrl gives an untyped get<T>', () => {
		const riva = createRiva({ rest: rest({ baseUrl: 'http://x' }) });
		expectTypeOf(riva.rest.get<{ a: 1 }>('/a')).toEqualTypeOf<
			Resource<{ a: 1 }>
		>();
		expectTypeOf(riva.rest.get('/a')).toEqualTypeOf<Resource<unknown>>();
		// Never run: it would fetch.
		const _post = () => riva.rest.post<number>('/a');
		expectTypeOf(_post).returns.toEqualTypeOf<Promise<number>>();
	});
});

describe('riva.rest.get over a definition', () => {
	test('shares its entry with a loader ensure, typed by the definition', async () => {
		const { riva, seen, api } = server();
		const def = query(api, 'get /invoices/{id}');
		await def.ensure(riva, { param: { id: '1' } });
		const r = riva.rest.get(def, { param: { id: '1' } }, { staleTime: '1m' });
		expect(await r).toEqual(inv('1'));
		expect(seen).toEqual(['GET /invoices/1']);
		expectTypeOf(r).toEqualTypeOf<Resource<Invoice>>();
		// @ts-expect-error the input is required by the definition
		riva.rest.get(def);
	});

	test('invalidates: [def] marks the entry stale', async () => {
		const { riva, seen, api } = server();
		const def = query(api, 'get /health');
		await riva.rest.get(def, undefined, { staleTime: '1h' });
		await riva.rest.post('/invoices', { json: { number: 'N', total: 1 } }, {
			invalidates: [def],
		} as never);
		await riva.rest.get(def, undefined, { staleTime: '1h' });
		expect(seen.filter((s) => s === 'GET /health')).toHaveLength(2);
	});
});
