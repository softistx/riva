import { expect, test } from 'bun:test';
import {
	createRivaClient,
	type RivaClient,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
	RivaScopeError,
} from '@softistx/riva';
import { RouterContextProvider } from 'react-router';
import { rivaContext } from '../context';
import { type DataOperation, dataRoute } from './data-route';

const URL_ = 'http://app.test/_data';

/**
 * happy-dom's `Request` (registered for every spec of this package) drops the
 * headers a browser forbids a page to set, `Origin` and `Sec-Fetch-Site`. A
 * server receives them, so read them back through a proxy.
 */
function withHeaders(request: Request, all: Record<string, string>): Request {
	const lower = Object.fromEntries(
		Object.entries(all).map(([k, v]) => [k.toLowerCase(), v]),
	);
	return new Proxy(request, {
		get(target, prop) {
			if (prop === 'headers')
				return { get: (k: string) => lower[k.toLowerCase()] ?? null };
			const value = Reflect.get(target, prop);
			return typeof value === 'function' ? value.bind(target) : value;
		},
	});
}

function setup(
	run?: DataOperation['run'],
	extra: Record<string, unknown> = {},
) {
	const calls: unknown[] = [];
	const op: DataOperation = {
		kind: 'query',
		run:
			run ??
			(async (_c, vars) => {
				calls.push(vars);
				return { ok: true, at: new Date(0) };
			}),
	};
	const errors: unknown[] = [];
	const route = dataRoute({
		sources: [{ find: (id) => (id === 'Op' ? op : undefined) }],
		onError: (e) => errors.push(e),
		...extra,
	});
	const context = new RouterContextProvider();
	context.set(rivaContext, createRivaClient());
	const call = (init: RequestInit & { url?: string } = {}) =>
		route.action({
			request: withHeaders(
				new Request(init.url ?? URL_, {
					method: 'POST',
					body: JSON.stringify({ id: 'Op', variables: { a: 1 } }),
					...init,
					headers: {},
				}),
				(init.headers as Record<string, string> | undefined) ?? {
					'content-type': 'application/json',
				},
			),
			context,
		});
	return { route, call, calls, errors, context };
}

const errorOf = async (res: Response) =>
	((await res.json()) as { error: { code: string; status: number } }).error;

test('a call runs the operation and answers { data } with Dates encoded', async () => {
	const { call, calls } = setup();
	const res = await call();
	expect(res.status).toBe(200);
	expect(res.headers.get('cache-control')).toBe('no-store');
	expect(await res.json()).toEqual({
		data: { ok: true, at: { $t: 'D', v: '1970-01-01T00:00:00.000Z' } },
	});
	expect(calls).toEqual([{ a: 1 }]);
});

test('the variables are decoded before they reach the operation', async () => {
	const { call, calls } = setup();
	await call({
		body: JSON.stringify({
			id: 'Op',
			variables: { at: { $t: 'D', v: '1970-01-01T00:00:00.000Z' } },
		}),
	});
	expect((calls[0] as { at: Date }).at).toBeInstanceOf(Date);
});

test('the operation gets the request client and the request signal', async () => {
	let seen: { client?: RivaClient; signal?: AbortSignal } = {};
	const { call, context } = setup(async (client, _v, signal) => {
		seen = { client, signal };
		return 1;
	});
	const controller = new AbortController();
	await call({ signal: controller.signal });
	expect(seen.client).toBe(context.get(rivaContext) ?? undefined);
	controller.abort();
	expect(seen.signal?.aborted).toBe(true);
});

test('not a POST is a 405 with Allow, from the action and from the loader', async () => {
	const { call, route } = setup();
	for (const res of [await call({ method: 'PUT' }), route.loader()]) {
		expect(res.status).toBe(405);
		expect(res.headers.get('allow')).toBe('POST');
		expect((await errorOf(res)).code).toBe('RIVA_DATA_METHOD');
	}
});

test('a foreign Origin, or Sec-Fetch-Site other than same-origin or none, is a 403', async () => {
	const { call, calls } = setup();
	for (const headers of [
		{ origin: 'http://evil.test' },
		{ origin: 'null' },
		{ 'sec-fetch-site': 'cross-site' },
		{ 'sec-fetch-site': 'same-site' },
	]) {
		const res = await call({
			headers: { 'content-type': 'application/json', ...headers },
		});
		expect(res.status).toBe(403);
		expect((await errorOf(res)).code).toBe('RIVA_DATA_CROSS_SITE');
	}
	expect(calls).toEqual([]);
});

test('the same origin passes, with or without the header; none and same-origin sites pass', async () => {
	const { call } = setup();
	for (const headers of [
		{ origin: 'http://app.test' },
		{ 'sec-fetch-site': 'same-origin' },
		{ 'sec-fetch-site': 'none' },
		{},
	])
		expect(
			(
				await call({
					headers: { 'content-type': 'application/json', ...headers },
				})
			).status,
		).toBe(200);
});

test('the configured origin replaces the request origin, as a string or a function', async () => {
	const headers = {
		'content-type': 'application/json',
		origin: 'https://public.test',
	};
	expect((await setup().call({ headers })).status).toBe(403);
	expect(
		(
			await setup(undefined, { origin: 'https://public.test' }).call({
				headers,
			})
		).status,
	).toBe(200);
	expect(
		(
			await setup(undefined, { origin: () => 'https://public.test' }).call({
				headers,
			})
		).status,
	).toBe(200);
	expect(
		(await setup(undefined, { origin: () => undefined }).call({ headers }))
			.status,
	).toBe(403);
});

test('a body that is not application/json is a 415', async () => {
	const { call } = setup();
	for (const type of ['text/plain', 'application/jsonp', '']) {
		const res = await call({ headers: type ? { 'content-type': type } : {} });
		expect(res.status).toBe(415);
		expect((await errorOf(res)).code).toBe('RIVA_DATA_MEDIA_TYPE');
	}
	expect(
		(
			await call({
				headers: { 'content-type': 'application/json; charset=utf-8' },
			})
		).status,
	).toBe(200);
});

test('a body over maxBytes is a 413, by its length and by its stream', async () => {
	const { call, calls } = setup(undefined, { maxBytes: 64 });
	const big = JSON.stringify({ id: 'Op', variables: { s: 'x'.repeat(200) } });
	const declared = await call({ body: big });
	expect(declared.status).toBe(413);
	expect((await errorOf(declared)).code).toBe('RIVA_DATA_TOO_LARGE');
	// No content-length: the cap applies while the stream is read.
	let sent = 0;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			sent += 1;
			controller.enqueue(new TextEncoder().encode('x'.repeat(40)));
			if (sent > 1000) controller.close();
		},
	});
	const streamed = await call({
		body: stream,
		// @ts-expect-error duplex is a Bun and Node option
		duplex: 'half',
	});
	expect(streamed.status).toBe(413);
	expect(sent).toBeLessThan(10);
	expect(calls).toEqual([]);
});

test('anything but { id: string, variables?: object } is a 400', async () => {
	const { call, calls } = setup();
	for (const body of [
		'not json',
		'',
		'null',
		'[]',
		'{}',
		'{"id":1}',
		'{"id":"Op","variables":[]}',
		'{"id":"Op","variables":"x"}',
	]) {
		const res = await call({ body });
		expect(res.status).toBe(400);
		expect((await errorOf(res)).code).toBe('RIVA_DATA_BAD_REQUEST');
	}
	expect((await call({ body: JSON.stringify({ id: 'Op' }) })).status).toBe(200);
	expect(calls.length).toBe(1);
});

test('an unknown id is a 404 and nothing runs, even with a method name as id', async () => {
	const { call, calls } = setup();
	for (const id of ['Nope', 'toString', '__proto__']) {
		const res = await call({ body: JSON.stringify({ id }) });
		expect(res.status).toBe(404);
		expect((await errorOf(res)).code).toBe('RIVA_DATA_UNKNOWN');
	}
	expect(calls).toEqual([]);
});

test('the sources are asked in order and the first that knows the id runs it', async () => {
	const ran: string[] = [];
	const source = (name: string, known: boolean) => ({
		find: () =>
			known
				? ({
						kind: 'query',
						run: async () => {
							ran.push(name);
							return name;
						},
					} as DataOperation)
				: undefined,
	});
	const route = dataRoute({
		sources: [source('a', false), source('b', true), source('c', true)],
	});
	const context = new RouterContextProvider();
	context.set(rivaContext, createRivaClient());
	const res = await route.action({
		request: new Request(URL_, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"id":"x"}',
		}),
		context,
	});
	expect(await res.json()).toEqual({ data: 'b' });
	expect(ran).toEqual(['b']);
});

test('a RivaRequestError is forwarded untouched: its code, message and status', async () => {
	const { call, errors } = setup(async () => {
		throw new RivaRequestError('PATIENT_LOCKED', 'The patient is locked.', {
			status: 409,
			retryable: false,
		});
	});
	const res = await call();
	expect(res.status).toBe(409);
	expect(await res.json()).toEqual({
		error: {
			code: 'PATIENT_LOCKED',
			message: 'The patient is locked.',
			status: 409,
		},
	});
	expect(errors).toEqual([]);
});

test('a RivaRequestError with no status is a 502', async () => {
	const { call } = setup(async () => {
		throw new RivaRequestError('DOWN', 'The API is down.', { retryable: true });
	});
	const res = await call();
	expect(res.status).toBe(502);
	expect((await errorOf(res)).code).toBe('DOWN');
});

test('any other error is a generic 500 that hides its message and reaches onError', async () => {
	const boom = new Error('secret: db password');
	const { call, errors } = setup(async () => {
		throw boom;
	});
	const res = await call();
	expect(res.status).toBe(500);
	const text = await res.text();
	expect(text).toContain('RIVA_DATA_INTERNAL');
	expect(text).not.toContain('secret');
	expect(errors).toEqual([boom]);
});

test('a result that cannot be encoded is a 500, and a failing onError does not crash the route', async () => {
	const { call } = setup(async () => ({ f: () => 1 }), {
		onError: () => {
			throw new Error('logger down');
		},
	});
	expect((await call()).status).toBe(500);
});

test('a request with no rivaMiddleware is a 500 naming nothing', async () => {
	const { route, errors } = setup();
	const res = await route.action({
		request: new Request(URL_, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"id":"Op"}',
		}),
		context: new RouterContextProvider(),
	});
	expect(res.status).toBe(500);
	expect(errors[0]).toBeInstanceOf(RivaScopeError);
});

test('variables that cannot be decoded are a 400, never a 500', async () => {
	const { call, calls, errors } = setup();
	const res = await call({
		body: '{"id":"Op","variables":{"$t":"O","v":null}}',
	});
	expect(res.status).toBe(400);
	expect((await errorOf(res)).code).toBe('RIVA_DATA_BAD_REQUEST');
	expect(calls).toEqual([]);
	expect(errors).toEqual([]);
});

test('a status outside 400..599 is a 502', async () => {
	for (const status of [600, 200, 302, 399]) {
		const { call } = setup(async () => {
			throw new RivaRequestError('ODD', 'Odd.', { status, retryable: false });
		});
		const res = await call();
		expect(res.status).toBe(502);
		expect((await errorOf(res)).code).toBe('ODD');
	}
	const { call } = setup(async () => {
		throw new RivaRequestError('EDGE', 'Edge.', {
			status: 599,
			retryable: false,
		});
	});
	expect((await call()).status).toBe(599);
});

test('a network or HTTP failure of the API keeps its code, hides its message and reaches onError', async () => {
	for (const error of [
		new RivaNetworkError('connect ECONNREFUSED 10.0.0.7:4000'),
		new RivaHttpError(503, '<html>proxy page at 10.0.0.7</html>'),
	]) {
		const { call, errors } = setup(async () => {
			throw error;
		});
		const res = await call();
		const text = await res.text();
		expect(res.status).toBe(error instanceof RivaHttpError ? 503 : 502);
		expect(text).toContain(error.code);
		expect(text).toContain('The API is unavailable.');
		expect(text).not.toContain('10.0.0.7');
		expect(errors).toEqual([error]);
	}
});
