import {
	isRetryableStatus,
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from '../errors';
import { decode, encode } from '../ssr/codec';

export interface BffTransportOptions {
	/** The `dataRoute` URL. Default `/_data`. */
	url?: string;
	/** Default: the global `fetch`, read at each call. */
	fetch?: typeof fetch;
	/** Extra headers of each call (e.g. a CSRF token). */
	headers?: () => HeadersInit;
}

const invalid = (message: string, status?: number) =>
	new RivaRequestError('RIVA_INVALID_RESPONSE', message, {
		retryable: false,
		...(status !== undefined && { status }),
	});

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The browser's side of a `/_data` route, shared by the adapters' `bffTransport`:
 * posts `{ id, variables }` (variables in the SSR codec, Dates included) and
 * reads `{ data }` back. The route's refusals and the API's errors come back as
 * `RivaRequestError` with the route's `code` and `status` (retryable for 5xx,
 * 408 and 429); a failed fetch is a `RivaNetworkError`, an abort a
 * `RivaAbortError`, a body that is not the route's JSON `RIVA_INVALID_RESPONSE`.
 * Cookies of the same origin go with the call.
 */
export async function postData(
	opts: BffTransportOptions,
	id: string,
	variables: unknown,
	signal?: AbortSignal,
): Promise<unknown> {
	let res: Response;
	let body: unknown;
	try {
		res = await (opts.fetch ?? fetch)(opts.url ?? '/_data', {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				...opts.headers?.(),
				'content-type': 'application/json',
			},
			body: JSON.stringify({ id, variables: encode(variables) }),
			...(signal && { signal }),
		});
	} catch (error) {
		if (signal?.aborted || (error as Error)?.name === 'AbortError')
			throw new RivaAbortError();
		throw new RivaNetworkError(
			error instanceof Error ? error.message : undefined,
			{ cause: error },
		);
	}
	try {
		body = await res.json();
	} catch {
		if (signal?.aborted) throw new RivaAbortError();
		throw invalid(
			`The data route answered ${res.status} with a body that is not JSON.`,
			res.status,
		);
	}
	if (!res.ok) {
		const failure = isRecord(body) ? body['error'] : undefined;
		if (isRecord(failure) && typeof failure['code'] === 'string')
			throw new RivaRequestError(
				failure['code'],
				typeof failure['message'] === 'string'
					? failure['message']
					: `HTTP ${res.status}`,
				{ status: res.status, retryable: isRetryableStatus(res.status) },
			);
		throw new RivaHttpError(res.status);
	}
	if (!isRecord(body) || !('data' in body))
		throw invalid('The data route answered without a "data" field.');
	return decode(body['data']);
}
