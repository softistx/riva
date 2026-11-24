import { expect, test } from 'bun:test';
import {
	ApiError,
	ApiStatusError,
	ApiUnavailableError,
} from '@softistx/graphql-client';
import {
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '@softistx/riva';
import { toRivaError } from './errors';

const api = (code: string | undefined, http?: number, httpStatus = 200) =>
	new ApiError(
		[
			{
				message: 'Refused',
				extensions: {
					...(code && { code }),
					...(http && { http: { status: http } }),
				},
			},
		],
		null,
		httpStatus,
	);

test('an ApiError keeps the API code untouched and is not retryable on a refusal', () => {
	const cause = api('patient.errors.not-found');
	const e = toRivaError(cause) as RivaRequestError;
	expect(e).toBeInstanceOf(RivaRequestError);
	expect(e.code).toBe('patient.errors.not-found');
	expect(e.message).toBe('Refused');
	expect(e.status).toBe(400);
	expect(e.retryable).toBe(false);
	expect(e.cause).toBe(cause);
});

test('an ApiError is retryable for 5xx, 408 and 429 only', () => {
	const retry = (status: number) =>
		(toRivaError(api('X', status)) as RivaRequestError).retryable;
	expect([retry(500), retry(503), retry(408), retry(429)]).toEqual([
		true,
		true,
		true,
		true,
	]);
	expect([retry(400), retry(401), retry(403), retry(404), retry(422)]).toEqual([
		false,
		false,
		false,
		false,
		false,
	]);
	expect(
		(toRivaError(api('X', undefined, 502)) as RivaRequestError).status,
	).toBe(502);
});

test('an ApiError with no code reads GRAPHQL_ERROR', () => {
	expect((toRivaError(api(undefined)) as RivaRequestError).code).toBe(
		'GRAPHQL_ERROR',
	);
});

test('an ApiStatusError becomes a RivaHttpError with its status', () => {
	const cause = new ApiStatusError(503, undefined);
	const e = toRivaError(cause) as RivaHttpError;
	expect(e).toBeInstanceOf(RivaHttpError);
	expect([e.status, e.code, e.retryable, e.cause]).toEqual([
		503,
		'HTTP_503',
		true,
		cause,
	]);
	expect(
		(toRivaError(new ApiStatusError(404, null)) as RivaHttpError).retryable,
	).toBe(false);
});

test('an unreachable API or a timeout is a retryable RivaNetworkError', () => {
	for (const reason of ['unreachable', 'timeout'] as const) {
		const e = toRivaError(new ApiUnavailableError(reason)) as RivaNetworkError;
		expect(e).toBeInstanceOf(RivaNetworkError);
		expect(e.retryable).toBe(true);
	}
});

test('an answer with neither data nor errors is not retryable', () => {
	const e = toRivaError(
		new ApiUnavailableError('invalid-response'),
	) as RivaRequestError;
	expect([e.code, e.retryable]).toEqual(['RIVA_INVALID_RESPONSE', false]);
});

test('an aborted signal wins over whatever was thrown', () => {
	const ctl = new AbortController();
	ctl.abort(new Error('why'));
	expect(toRivaError(new Error('why'), ctl.signal)).toBeInstanceOf(
		RivaAbortError,
	);
	expect(toRivaError(new DOMException('x', 'AbortError'))).toBeInstanceOf(
		RivaAbortError,
	);
});

test('a riva error and an unknown error pass through', () => {
	const riva = new RivaNetworkError();
	const other = new RangeError('boom');
	expect(toRivaError(riva)).toBe(riva);
	expect(toRivaError(other)).toBe(other);
	expect(toRivaError('text')).toBe('text');
});

test('errors are read by name, so another copy of the package maps too', () => {
	const copy = Object.assign(new Error('Nope'), {
		name: 'ApiError',
		errors: [{ message: 'Nope', extensions: { code: 'A' } }],
		code: 'A',
		status: 403,
	});
	expect(toRivaError(copy)).toBeInstanceOf(RivaRequestError);
});

test('an ApiError with no status is read as 400 and never retried; a 503 status error retries, a 404 does not', () => {
	const noStatus = toRivaError(api('X')) as RivaRequestError;
	expect([noStatus.status, noStatus.retryable]).toEqual([400, false]);
	const retryable = (status: number) =>
		(toRivaError(new ApiStatusError(status, null)) as RivaHttpError).retryable;
	expect([retryable(503), retryable(404)]).toEqual([true, false]);
});
