import { expect, test } from 'bun:test';
import {
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	type RivaRequestError,
	RivaScopeError,
} from '@softistx/riva';
import { apiOver, httpWith, json } from '../test/fixtures';
import { httpyzTransport } from './http-transport';

type Failed = RivaRequestError & { cause: { data: unknown } };
const failed = async (p: Promise<unknown>) =>
	(await p.then(
		() => {
			throw new Error('resolved');
		},
		(e) => e,
	)) as Failed;
const seen: Request[] = [];
const transport = (
	handle: (r: Request) => Response | Promise<Response>,
	httpOptions: object = {},
) => {
	const http = httpWith((r) => {
		seen.push(r);
		return handle(r);
	}, httpOptions);
	return httpyzTransport(http, apiOver(http));
};
const signal = () => new AbortController().signal;

test('calls the operation with its input and returns the data of the 2xx reply', async () => {
	const t = transport(() => json({ id: '7', number: 'F-7', total: 12 }));
	const data = await t.call(
		{ method: 'get', path: '/invoices/{id}' },
		{ param: { id: '7' } },
		{ signal: signal() },
	);
	expect(data).toEqual({ id: '7', number: 'F-7', total: 12 });
	expect(seen.at(-1)?.url).toBe('http://api.test/invoices/7');
});

test('sends a body and the query', async () => {
	const t = transport((r) =>
		r.method === 'POST' ? json({ id: '1' }, 201) : json({ items: [] }),
	);
	await t.call(
		{ method: 'post', path: '/invoices' },
		{ json: { number: 'F-1', total: 5 } },
		{ signal: signal() },
	);
	expect(await seen.at(-1)?.json()).toEqual({ number: 'F-1', total: 5 });
	await t.call(
		{ method: 'get', path: '/invoices' },
		{ query: { page: 2 } },
		{ signal: signal() },
	);
	expect(seen.at(-1)?.url).toBe('http://api.test/invoices?page=2');
	await t.call({ method: 'get', path: '/invoices' }, undefined, {
		signal: signal(),
	});
	expect(seen.at(-1)?.url).toBe('http://api.test/invoices');
});

test('an operation with no input is called with the signal alone', async () => {
	const t = transport(() => json({ ok: true }));
	expect(
		await t.call({ method: 'get', path: '/health' }, undefined, {
			signal: signal(),
		}),
	).toEqual({ ok: true });
});

test('a declared non-2xx reply is a RivaHttpError holding the reply', async () => {
	const t = transport(() => json({ title: 'Not found' }, 404));
	const error = await failed(
		t.call(
			{ method: 'get', path: '/invoices/{id}' },
			{ param: { id: '9' } },
			{ signal: signal() },
		),
	);
	expect(error).toBeInstanceOf(RivaHttpError);
	expect(error.status).toBe(404);
	expect(error.retryable).toBe(false);
	expect(error.cause.data).toEqual({ title: 'Not found' });
});

test('an undeclared status is a RivaHttpError, a 503 retryable', async () => {
	const t = transport(() => new Response('down', { status: 503 }));
	const error = await failed(
		t.call({ method: 'get', path: '/health' }, undefined, { signal: signal() }),
	);
	expect(error).toBeInstanceOf(RivaHttpError);
	expect(error.status).toBe(503);
	expect(error.retryable).toBe(true);
});

test('a failed fetch is a RivaNetworkError', async () => {
	const t = transport(() => {
		throw new TypeError('fetch failed');
	});
	const error = await failed(
		t.call({ method: 'get', path: '/health' }, undefined, { signal: signal() }),
	);
	expect(error).toBeInstanceOf(RivaNetworkError);
	expect(error.retryable).toBe(true);
});

test('the signal reaches the request and an abort is a RivaAbortError', async () => {
	let reqSignal: AbortSignal | undefined;
	const c = new AbortController();
	const t = transport(
		(r) =>
			new Promise<Response>((_, reject) => {
				reqSignal = r.signal;
				r.signal.addEventListener('abort', () =>
					reject(new DOMException('stop', 'AbortError')),
				);
			}),
	);
	const p = failed(
		t.call({ method: 'get', path: '/health' }, undefined, { signal: c.signal }),
	);
	await Bun.sleep(5);
	expect(reqSignal?.aborted).toBe(false);
	c.abort();
	expect(await p).toBeInstanceOf(RivaAbortError);
	expect(reqSignal?.aborted).toBe(true);
});

test('a route the client does not have is a TypeError, and no api is a scope error', async () => {
	const t = transport(() => json({}));
	await expect(
		t.call({ method: 'get', path: '/nope' }, undefined, { signal: signal() }),
	).rejects.toThrow(TypeError);
	const bare = httpyzTransport(httpWith(() => json({})));
	await expect(
		bare.call({ method: 'get', path: '/health' }, undefined, {
			signal: signal(),
		}),
	).rejects.toBeInstanceOf(RivaScopeError);
});
