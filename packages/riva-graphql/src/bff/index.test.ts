import { expect, test } from 'bun:test';
import {
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '@softistx/riva';
import { parse } from 'graphql';
import { operationOf } from '../operation';
import { bffTransport } from './index';

const op = operationOf(
	parse('query Patients($at: String) { patients(at: $at) { id } }') as never,
);
const signal = () => new AbortController().signal;

const json = (body: unknown, status = 200) => Response.json(body, { status });

function run(
	answer: (req: Request) => Response | Promise<Response>,
	vars: unknown = { a: 1 },
	opts: Parameters<typeof bffTransport>[0] = {},
) {
	const requests: Array<{ url: string; init: RequestInit }> = [];
	const t = bffTransport({
		fetch: (async (url: string, init: RequestInit) => {
			requests.push({ url, init });
			return answer(new Request(`http://x${url}`, init));
		}) as never,
		...opts,
	});
	return {
		requests,
		result: t.execute(op, vars as never, { signal: signal() }),
	};
}

test('posts the id and the encoded variables to /_data with the same-origin credentials', async () => {
	const { requests, result } = run(() => json({ data: { ok: 1 } }), {
		at: new Date(0),
	});
	expect(await result).toEqual({ ok: 1 });
	const [req] = requests;
	expect(req?.url).toBe('/_data');
	expect(req?.init.method).toBe('POST');
	expect(req?.init.credentials).toBe('same-origin');
	expect(JSON.parse(req?.init.body as string)).toEqual({
		id: 'Patients',
		variables: { at: { $t: 'D', v: '1970-01-01T00:00:00.000Z' } },
	});
	const headers = req?.init.headers as Record<string, string>;
	expect(headers['content-type']).toBe('application/json');
});

test("the url and the headers are the caller's, the content type is not overridable", async () => {
	const { requests, result } = run(
		() => json({ data: 1 }),
		{},
		{
			url: '/api/data',
			headers: () => ({ 'x-csrf': 't', 'content-type': 'text/plain' }),
		},
	);
	await result;
	expect(requests[0]?.url).toBe('/api/data');
	const headers = requests[0]?.init.headers as Record<string, string>;
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
		expect(
			await bffTransport().execute(op, {} as never, { signal: signal() }),
		).toBe(7);
	} finally {
		globalThis.fetch = real;
	}
});

async function failure(answer: Response | (() => never)) {
	const { result } = run(typeof answer === 'function' ? answer : () => answer);
	return result.then(
		() => undefined,
		(e: unknown) => e,
	);
}

test('an error body becomes a RivaRequestError with the route code and the HTTP status', async () => {
	const e = (await failure(
		json(
			{ error: { code: 'PATIENT_LOCKED', message: 'Locked.', status: 409 } },
			409,
		),
	)) as RivaRequestError;
	expect(e).toBeInstanceOf(RivaRequestError);
	expect([e.code, e.message, e.status, e.retryable]).toEqual([
		'PATIENT_LOCKED',
		'Locked.',
		409,
		false,
	]);
});

test('retryable is true for 5xx, 408 and 429 only', async () => {
	for (const [status, retryable] of [
		[500, true],
		[502, true],
		[408, true],
		[429, true],
		[400, false],
		[403, false],
		[404, false],
	] as const) {
		const e = (await failure(
			json({ error: { code: 'X', message: 'm', status } }, status),
		)) as RivaRequestError;
		expect(e.retryable).toBe(retryable);
	}
});

test("an error status with JSON that is not the route's shape is a RivaHttpError", async () => {
	const e = await failure(json({ nope: 1 }, 503));
	expect(e).toBeInstanceOf(RivaHttpError);
	expect((e as RivaHttpError).status).toBe(503);
});

test('a body that is not JSON is RIVA_INVALID_RESPONSE, not retryable', async () => {
	for (const status of [200, 502]) {
		const e = (await failure(
			new Response('<html>', { status }),
		)) as RivaRequestError;
		expect(e.code).toBe('RIVA_INVALID_RESPONSE');
		expect(e.retryable).toBe(false);
		expect(e.status).toBe(status);
	}
});

test('a 200 with no data field is RIVA_INVALID_RESPONSE', async () => {
	const e = (await failure(json({ hello: 1 }))) as RivaRequestError;
	expect(e.code).toBe('RIVA_INVALID_RESPONSE');
});

test('a failed fetch is a retryable RivaNetworkError keeping its cause', async () => {
	const cause = new TypeError('fetch failed');
	const e = (await failure(() => {
		throw cause;
	})) as RivaNetworkError;
	expect(e).toBeInstanceOf(RivaNetworkError);
	expect(e.retryable).toBe(true);
	expect(e.cause).toBe(cause);
});

test('an abort, before or while reading, is a RivaAbortError', async () => {
	const controller = new AbortController();
	const t = bffTransport({
		fetch: ((_url: string, init: RequestInit) =>
			new Promise((_resolve, reject) => {
				init.signal?.addEventListener('abort', () =>
					reject(new DOMException('aborted', 'AbortError')),
				);
			})) as never,
	});
	const pending = t.execute(op, {} as never, { signal: controller.signal });
	controller.abort();
	expect(await pending.catch((e: unknown) => e)).toBeInstanceOf(RivaAbortError);
});
