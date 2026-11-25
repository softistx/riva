import type { HttpClient } from '@softistx/httpyz';
import {
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
	RivaScopeError,
} from '@softistx/riva';
import { decode, encode } from '@softistx/riva/ssr';
import type { RestTransport } from '../transport';

export interface BffTransportOptions {
	/** The `dataRoute` URL. Default `/_data`. */
	url?: string;
	/** Default: the global `fetch`, read at each call. */
	fetch?: typeof fetch;
	/** Extra headers of each call (e.g. a CSRF token). */
	headers?: () => HeadersInit;
}

const retryable = (status: number) =>
	status >= 500 || status === 408 || status === 429;

const invalid = (message: string, status?: number) =>
	new RivaRequestError('RIVA_INVALID_RESPONSE', message, {
		retryable: false,
		...(status !== undefined && { status }),
	});

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The browser's REST transport: posts `{ id: 'rest:<operationId>', variables }`
 * to a `dataRoute` and reads `{ data }` back, Dates included. The route's
 * refusals and the API's errors come back as `RivaRequestError` with the
 * route's `code` and `status` (retryable for 5xx, 408 and 429); a failed fetch
 * is a `RivaNetworkError`, an abort a `RivaAbortError`, a body that is not the
 * route's JSON `RIVA_INVALID_RESPONSE`. Cookies of the same origin go with the
 * call. It holds no httpyz client: a free fetcher that reads `http` throws
 * `RivaScopeError`, since it only runs on the server.
 */
export function bffTransport(opts: BffTransportOptions = {}): RestTransport {
	const url = opts.url ?? '/_data';
	return {
		get http(): HttpClient {
			throw new RivaScopeError(
				"A free fetcher uses httpyz, which is server-only: in the browser, call it through an operation of the API's spec (query(api, ...)) served by operations() on /_data, or run it in a loader.",
			);
		},
		async call(route, input, { signal }) {
			let res: Response;
			let body: unknown;
			try {
				res = await (opts.fetch ?? fetch)(url, {
					method: 'POST',
					credentials: 'same-origin',
					headers: {
						...opts.headers?.(),
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						id: `rest:${route.operationId}`,
						variables: encode(input),
					}),
					signal,
				});
			} catch (error) {
				if (signal.aborted || (error as Error)?.name === 'AbortError')
					throw new RivaAbortError();
				throw new RivaNetworkError(
					error instanceof Error ? error.message : undefined,
					{ cause: error },
				);
			}
			try {
				body = await res.json();
			} catch {
				if (signal.aborted) throw new RivaAbortError();
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
						{ status: res.status, retryable: retryable(res.status) },
					);
				throw new RivaHttpError(res.status);
			}
			if (!isRecord(body) || !('data' in body))
				throw invalid('The data route answered without a "data" field.');
			return decode(body['data']);
		},
	};
}
