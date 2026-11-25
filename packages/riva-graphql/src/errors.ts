import {
	isRetryableStatus,
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '@softistx/riva';

// The graphql-client errors are read by name, not by `instanceof`, so a second
// copy of the package (or none imported here) still maps, and this entry
// never imports the client at runtime.
type Failure = Error & {
	errors?: unknown;
	code?: string;
	status?: number;
	reason?: string;
};

const isNamed = (e: unknown, name: string): e is Failure =>
	e instanceof Error && e.name === name;

/**
 * Maps what `@softistx/graphql-client` throws to riva's errors, so the
 * core's retry policy and `instanceof` checks work:
 *
 * - the caller's abort: `RivaAbortError`;
 * - `ApiError` (the response carried `errors`): `RivaRequestError` with the
 *   API's `extensions.code` untouched, its `status`, retryable only for 5xx,
 *   408 and 429; the `ApiError` is its `cause`;
 * - `ApiStatusError`: `RivaHttpError`;
 * - `ApiUnavailableError`: `RivaNetworkError` (unreachable, timeout) or a
 *   non-retryable `RivaRequestError` (`RIVA_INVALID_RESPONSE`).
 *
 * Anything else is returned as it is.
 */
export function toRivaError(error: unknown, signal?: AbortSignal): unknown {
	if (error instanceof RivaAbortError) return error;
	if (
		signal?.aborted ||
		(error instanceof Error && error.name === 'AbortError')
	)
		return new RivaAbortError();
	if (isNamed(error, 'ApiError') && Array.isArray(error.errors)) {
		const status = error.status ?? 400;
		return new RivaRequestError(error.code ?? 'GRAPHQL_ERROR', error.message, {
			status,
			retryable: isRetryableStatus(status),
			cause: error,
		});
	}
	if (isNamed(error, 'ApiStatusError') && typeof error.status === 'number')
		return new RivaHttpError(error.status, error.message, { cause: error });
	if (isNamed(error, 'ApiUnavailableError')) {
		if (error.reason === 'invalid-response')
			return new RivaRequestError('RIVA_INVALID_RESPONSE', error.message, {
				retryable: false,
				cause: error,
			});
		return new RivaNetworkError(error.message, { cause: error });
	}
	return error;
}
