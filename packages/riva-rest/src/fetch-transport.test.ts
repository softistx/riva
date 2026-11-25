import { expect, test } from 'bun:test';
import {
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '@softistx/riva';
import { fetchTransport, type RestBaseOptions } from './fetch-transport';

const route = (method: string, path: string) => ({
	method,
	path,
	operationId: '',
	hasInput: true,
});
const reply = (body: unknown, status = 200) =>
	new Response(body === undefined ? null : JSON.stringify(body), { status });
const ctl = () => ({ signal: new AbortController().signal });

function over(handle: (r: Request) => Response | Promise<Response>, o = {}) {
	const seen: Request[] = [];
	const t = fetchTransport({
		baseUrl: 'http://api.test/v1/',
		fetch: async (r) => {
			seen.push(r);
			return handle(r);
		},
		...o,
	} as RestBaseOptions);
	return { t, seen };
}

test('fills the path, the query string and the JSON body', async () => {
	const { t, seen } = over(() => reply({ ok: 1 }), {
		headers: { authorization: 'Bearer x' },
	});
	const data = await t.call(
		route('post', '/invoices/{id}/lines'),
		{
			param: { id: 'a b' },
			query: { tag: ['x', 'y'], none: undefined, page: 2 },
			json: { n: 1 },
		},
		ctl(),
	);
	expect(data).toEqual({ ok: 1 });
	expect(seen[0]?.url).toBe(
		'http://api.test/v1/invoices/a%20b/lines?tag=x&tag=y&page=2',
	);
	expect(seen[0]?.method).toBe('POST');
	expect(seen[0]?.headers.get('authorization')).toBe('Bearer x');
	expect(seen[0]?.headers.get('content-type')).toBe('application/json');
	expect(await seen[0]?.json()).toEqual({ n: 1 });
});

test('an empty reply is undefined; no input is fine', async () => {
	const { t } = over(() => new Response(null, { status: 204 }));
	expect(await t.call(route('delete', '/x'), undefined, ctl())).toBeUndefined();
});

test('a non-2xx reply is a RivaHttpError', async () => {
	const { t } = over(() => reply({}, 503));
	const e = (await t
		.call(route('get', '/x'), {}, ctl())
		.catch((x) => x)) as RivaHttpError;
	expect(e).toBeInstanceOf(RivaHttpError);
	expect(e.status).toBe(503);
	expect(e.retryable).toBe(true);
});

test('a failed request is a RivaNetworkError, an abort a RivaAbortError', async () => {
	const down = over(() => {
		throw new TypeError('offline');
	});
	await expect(
		down.t.call(route('get', '/x'), {}, ctl()),
	).rejects.toBeInstanceOf(RivaNetworkError);
	const c = new AbortController();
	c.abort();
	await expect(
		down.t.call(route('get', '/x'), {}, { signal: c.signal }),
	).rejects.toBeInstanceOf(RivaAbortError);
});

test('a missing path param is a non-retryable RIVA_VALIDATION', async () => {
	const { t, seen } = over(() => reply({}));
	const e = (await t
		.call(route('get', '/a/{id}'), {}, ctl())
		.catch((x) => x)) as RivaRequestError;
	expect(e).toBeInstanceOf(RivaRequestError);
	expect(e.code).toBe('RIVA_VALIDATION');
	expect(seen).toHaveLength(0);
});

test('a param of "..", ".", "", or their encoded forms is refused before any request', async () => {
	const { t, seen } = over(() => reply({}));
	for (const id of ['..', '.', '', '%2e%2e', '%2E', '%2e.'])
		await expect(
			t.call(route('get', '/a/{id}'), { param: { id } }, ctl()),
		).rejects.toMatchObject({ code: 'RIVA_VALIDATION' });
	expect(seen).toHaveLength(0);
	await t.call(route('get', '/a/{id}'), { param: { id: 'a.b' } }, ctl());
	expect(seen).toHaveLength(1);
});

test('a 2xx reply that is not JSON is a non-retryable RIVA_INVALID_RESPONSE', async () => {
	const { t } = over(() => new Response('<html>', { status: 200 }));
	const e = (await t
		.call(route('get', '/x'), {}, ctl())
		.catch((x) => x)) as RivaRequestError;
	expect(e).toBeInstanceOf(RivaRequestError);
	expect(e.code).toBe('RIVA_INVALID_RESPONSE');
	expect(e.retryable).toBe(false);
});

test('asks for JSON by default; the caller headers override', async () => {
	const a = over(() => reply({}));
	await a.t.call(route('get', '/x'), {}, ctl());
	expect(a.seen[0]?.headers.get('accept')).toBe('application/json');
	const b = over(() => reply({}), { headers: { accept: 'text/plain' } });
	await b.t.call(route('get', '/x'), {}, ctl());
	expect(b.seen[0]?.headers.get('accept')).toBe('text/plain');
});
