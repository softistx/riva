import { expect, test } from 'bun:test';
import {
	isRetryableStatus,
	RivaAbortError,
	RivaError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
	RivaScopeError,
} from './errors';

test('RivaError carries a code and its name', () => {
	const e = new RivaError('X', 'boom');
	expect(e).toBeInstanceOf(Error);
	expect(e.code).toBe('X');
	expect(e.name).toBe('RivaError');
	expect(e.message).toBe('boom');
});

test('RivaScopeError is a RivaError with the scope code', () => {
	const e = new RivaScopeError('no client');
	expect(e).toBeInstanceOf(RivaError);
	expect(e).toBeInstanceOf(RivaScopeError);
	expect(e.code).toBe('RIVA_SCOPE');
	expect(e.name).toBe('RivaScopeError');
});

test('RivaHttpError derives its code and retryability from the status', () => {
	const cause = new Error('c');
	const e = new RivaHttpError(503, 'down', { cause });
	expect(e).toBeInstanceOf(RivaRequestError);
	expect(e).toBeInstanceOf(RivaError);
	expect(e.code).toBe('HTTP_503');
	expect(e.status).toBe(503);
	expect(e.cause).toBe(cause);
	expect(e.name).toBe('RivaHttpError');
	for (const s of [500, 502, 408, 429])
		expect(new RivaHttpError(s).retryable).toBe(true);
	for (const s of [400, 401, 404, 422])
		expect(new RivaHttpError(s).retryable).toBe(false);
	expect(new RivaHttpError(404).message).toBe('HTTP 404');
});

test('RivaNetworkError is retryable, RivaAbortError is not a request error', () => {
	const n = new RivaNetworkError();
	expect(n.code).toBe('RIVA_NETWORK');
	expect(n.retryable).toBe(true);
	expect(n.status).toBeUndefined();
	const a = new RivaAbortError();
	expect(a.code).toBe('RIVA_ABORT');
	expect(a).toBeInstanceOf(RivaError);
	expect(a).not.toBeInstanceOf(RivaRequestError);
});

test('RivaRequestError carries what an adapter gives it', () => {
	const e = new RivaRequestError('FORBIDDEN', 'no', { retryable: false });
	expect(e.code).toBe('FORBIDDEN');
	expect(e.retryable).toBe(false);
});

test('isRetryableStatus is true for 5xx, 408 and 429 only', () => {
	for (const s of [500, 503, 599, 408, 429])
		expect(isRetryableStatus(s)).toBe(true);
	for (const s of [200, 400, 401, 404, 499])
		expect(isRetryableStatus(s)).toBe(false);
});
