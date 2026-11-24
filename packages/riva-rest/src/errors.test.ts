import { expect, test } from 'bun:test';
import {
	ClientError,
	NetworkError,
	ReplyStatusError,
	TimeoutError,
	UndeclaredStatusError,
	ValidationError,
} from '@softistx/httpyz';
import {
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '@softistx/riva';
import { toRivaError } from './errors';

const ctx = { method: 'get', path: '/invoices/{id}' };

test('an undeclared status becomes a RivaHttpError with its status, retryable for 5xx, 408 and 429', () => {
	for (const [status, retryable] of [
		[404, false],
		[500, true],
		[503, true],
		[408, true],
		[429, true],
		[400, false],
	] as const) {
		const cause = new UndeclaredStatusError(
			ctx,
			new Response(null, { status }),
		);
		const e = toRivaError(cause) as RivaHttpError;
		expect(e).toBeInstanceOf(RivaHttpError);
		expect(e.status).toBe(status);
		expect(e.code).toBe(`HTTP_${status}`);
		expect(e.retryable).toBe(retryable);
		expect(e.cause).toBe(cause);
	}
});

test('a ReplyStatusError becomes a RivaHttpError', () => {
	const e = toRivaError(
		new ReplyStatusError({ status: 502, data: undefined }, [200]),
	);
	expect(e).toBeInstanceOf(RivaHttpError);
	expect((e as RivaHttpError).retryable).toBe(true);
});

test('a network failure and a timeout become a retryable RivaNetworkError', () => {
	for (const cause of [new NetworkError(ctx), new TimeoutError(ctx, 5000)]) {
		const e = toRivaError(cause) as RivaNetworkError;
		expect(e).toBeInstanceOf(RivaNetworkError);
		expect(e.retryable).toBe(true);
		expect(e.cause).toBe(cause);
	}
});

test('a refused request is RIVA_VALIDATION and a reply the spec does not describe RIVA_INVALID_RESPONSE, neither retryable', () => {
	const failure = (kind: 'request' | 'response') => ({
		kind,
		method: 'get',
		path: '/x',
		issues: [],
	});
	const req = toRivaError(new ValidationError(ctx, failure('request')));
	const res = toRivaError(new ValidationError(ctx, failure('response')));
	expect(req).toBeInstanceOf(RivaRequestError);
	expect((req as RivaRequestError).code).toBe('RIVA_VALIDATION');
	expect((req as RivaRequestError).retryable).toBe(false);
	expect((res as RivaRequestError).code).toBe('RIVA_INVALID_RESPONSE');
	expect((res as RivaRequestError).retryable).toBe(false);
});

test('an abort becomes RivaAbortError, by name or by the signal', () => {
	const abort = new DOMException('stop', 'AbortError');
	expect(toRivaError(abort)).toBeInstanceOf(RivaAbortError);
	const c = new AbortController();
	c.abort();
	expect(toRivaError(new NetworkError(ctx), c.signal)).toBeInstanceOf(
		RivaAbortError,
	);
	const done = new RivaAbortError();
	expect(toRivaError(done)).toBe(done);
});

test('riva errors and unknown errors pass through', () => {
	const http = new RivaHttpError(404);
	expect(toRivaError(http)).toBe(http);
	const other = new Error('boom');
	expect(toRivaError(other)).toBe(other);
	const client = new ClientError(ctx, 'x');
	expect(toRivaError(client)).toBe(client);
});
