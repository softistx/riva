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

/** One entry of a response's `errors`. */
export interface GraphQLErrorEntry {
	readonly message: string;
	/** Where in the result the error happened: `['viewer', 'friends', 0, 'name']`. */
	readonly path?: readonly (string | number)[];
	/** The API's `extensions.code`. */
	readonly code?: string;
}

const describe = (e: GraphQLErrorEntry): string =>
	e.path?.length ? `${e.message} (at ${e.path.join('.')})` : e.message;

/**
 * The response carried `errors`. `errors` lists them all with their paths,
 * `data` is what the API resolved despite them (a partial result), and `cause`
 * is the client's `ApiError`. A `RivaRequestError`, so `instanceof` and the
 * retry policy hold: the code, status and retryability are the first error's.
 */
export class GraphQLError extends RivaRequestError {
	readonly errors: readonly GraphQLErrorEntry[];
	readonly data: unknown;
	constructor(
		code: string,
		errors: readonly GraphQLErrorEntry[],
		data: unknown,
		options: { retryable: boolean; status?: number; cause?: unknown },
	) {
		super(code, errors.map(describe).join('; '), options);
		this.name = 'GraphQLError';
		this.errors = errors;
		this.data = data;
	}
}

const isNamed = (e: unknown, name: string): e is Failure =>
	e instanceof Error && e.name === name;

/**
 * Maps what `@softistx/graphql-client` throws to riva's errors, so the
 * core's retry policy and `instanceof` checks work:
 *
 * - the caller's abort: `RivaAbortError`;
 * - `ApiError` (the response carried `errors`): a `GraphQLError` (a `RivaRequestError`) with the
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
		const entries = (error.errors as GraphQLErrorEntry[]).map((e) => {
			const code = (e as { extensions?: { code?: unknown } }).extensions?.code;
			return {
				message: e.message,
				...(e.path && { path: e.path }),
				...(typeof code === 'string' && { code }),
			};
		});
		return new GraphQLError(
			error.code ?? 'GRAPHQL_ERROR',
			entries,
			(error as { data?: unknown }).data ?? undefined,
			{ status, retryable: isRetryableStatus(status), cause: error },
		);
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
