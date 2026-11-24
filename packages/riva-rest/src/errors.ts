import {
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '@softistx/riva';

// The httpyz errors are read by name, not by `instanceof`, so a second copy of
// the package (or none imported here) still maps, and this entry never imports
// httpyz at runtime.
type Failure = Error & {
	status?: number;
	failure?: { kind?: string; status?: number };
};

const isNamed = (e: unknown, name: string): e is Failure =>
	e instanceof Error && e.name === name;

/**
 * Maps what `@softistx/httpyz` throws to riva's errors, so the core's retry
 * policy and `instanceof` checks work:
 *
 * - the caller's abort: `RivaAbortError`;
 * - `UndeclaredStatusError` and `ReplyStatusError`: `RivaHttpError`, retryable
 *   for 5xx, 408 and 429;
 * - `NetworkError` and `TimeoutError`: `RivaNetworkError`, retryable;
 * - `ValidationError`: a non-retryable `RivaRequestError`, `RIVA_VALIDATION`
 *   for a request the spec refused (never sent) and `RIVA_INVALID_RESPONSE`
 *   for a reply the spec does not describe.
 *
 * Each keeps the httpyz error as its `cause`; anything else is returned as it
 * is.
 */
export function toRivaError(error: unknown, signal?: AbortSignal): unknown {
	if (error instanceof RivaAbortError) return error;
	if (
		signal?.aborted ||
		(error instanceof Error && error.name === 'AbortError')
	)
		return new RivaAbortError();
	if (error instanceof RivaHttpError || error instanceof RivaNetworkError)
		return error;
	if (
		(isNamed(error, 'UndeclaredStatusError') ||
			isNamed(error, 'ReplyStatusError')) &&
		typeof error.status === 'number'
	)
		return new RivaHttpError(error.status, error.message, { cause: error });
	if (isNamed(error, 'NetworkError') || isNamed(error, 'TimeoutError'))
		return new RivaNetworkError(error.message, { cause: error });
	if (isNamed(error, 'ValidationError'))
		return new RivaRequestError(
			error.failure?.kind === 'request'
				? 'RIVA_VALIDATION'
				: 'RIVA_INVALID_RESPONSE',
			error.message,
			{ retryable: false, cause: error },
		);
	return error;
}
