import { expect, expectTypeOf, test } from 'bun:test';
import {
	createRivaClient,
	RivaRequestError,
	RivaScopeError,
} from '@softistx/riva';
import { routeOf } from '../../test/fixtures';
import { query } from '../query';
import { provideRest, type RestTransport } from '../transport';
import { type BffTransportOptions, bffTransport } from './index';

const route = routeOf('get /invoices/{id}');
const signal = () => new AbortController().signal;
const json = (body: unknown, status = 200) => Response.json(body, { status });

function run(
	answer: (req: Request) => Response | Promise<Response>,
	input: unknown = { param: { id: '7' } },
	opts: BffTransportOptions = {},
) {
	const requests: Array<{ url: string; init: RequestInit }> = [];
	const t = bffTransport({
		fetch: (async (url: string, init: RequestInit) => {
			requests.push({ url, init });
			return answer(new Request(`http://x${url}`, init));
		}) as never,
		...opts,
	});
	return { requests, result: t.call(route, input, { signal: signal() }) };
}

test('posts rest:<operationId> and the encoded input to /_data with same-origin credentials', async () => {
	const { requests, result } = run(() => json({ data: { ok: 1 } }), {
		query: { at: new Date(0) },
	});
	expect(await result).toEqual({ ok: 1 });
	const [req] = requests;
	expect(req?.url).toBe('/_data');
	expect(req?.init.method).toBe('POST');
	expect(req?.init.credentials).toBe('same-origin');
	expect(JSON.parse(req?.init.body as string)).toEqual({
		id: 'rest:getInvoice',
		variables: { query: { at: { $t: 'D', v: '1970-01-01T00:00:00.000Z' } } },
	});
});

test("the url and headers are the caller's, the content type is not overridable", async () => {
	const { requests, result } = run(
		() => json({ data: 1 }),
		{},
		{
			url: '/api/data',
			headers: () => ({ 'x-csrf': 't', 'content-type': 'text/plain' }),
		},
	);
	await result;
	const headers = requests[0]?.init.headers as Record<string, string>;
	expect(requests[0]?.url).toBe('/api/data');
	expect(headers['x-csrf']).toBe('t');
	expect(headers['content-type']).toBe('application/json');
});

test('decodes Dates in the answer', async () => {
	const { result } = run(() =>
		json({ data: { at: { $t: 'D', v: '1970-01-01T00:00:00.000Z' } } }),
	);
	expect(((await result) as { at: Date }).at).toBeInstanceOf(Date);
});

test('the global fetch is read at each call', async () => {
	const real = globalThis.fetch;
	globalThis.fetch = (async () => json({ data: 7 })) as never;
	try {
		expect(await bffTransport().call(route, {}, { signal: signal() })).toBe(7);
	} finally {
		globalThis.fetch = real;
	}
});

test("the route's error becomes a RivaRequestError with its code and status", async () => {
	const { result } = run(() =>
		json({ error: { code: 'LOCKED', message: 'Locked.', status: 409 } }, 409),
	);
	const e = (await result.catch((x: unknown) => x)) as RivaRequestError;
	expect(e).toBeInstanceOf(RivaRequestError);
	expect([e.code, e.status]).toEqual(['LOCKED', 409]);
});

test('http throws a RivaScopeError naming server-only use, and a free fetcher reading it fails the same way', async () => {
	const t = bffTransport();
	expect(() => t.http).toThrow(RivaScopeError);
	expect(() => t.http).toThrow(/server-only/);
	const free = query({
		id: 'free',
		fetch: async (_v: undefined, { http }) => (await http.get('/x')).data,
	});
	const client = createRivaClient();
	provideRest(client, t);
	await expect(free.ensure(client)).rejects.toBeInstanceOf(RivaScopeError);
});

test('types: a RestTransport taking the shared options', () => {
	expectTypeOf(bffTransport).returns.toEqualTypeOf<RestTransport>();
	expectTypeOf<BffTransportOptions['headers']>().toEqualTypeOf<
		(() => HeadersInit) | undefined
	>();
});
