import type { HttpClient } from '@softistx/httpyz';
import { RivaScopeError } from '@softistx/riva';
import { type BffTransportOptions, postData } from '@softistx/riva/data';
import type { RestTransport } from '../transport';

export type { BffTransportOptions };

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
	return {
		get http(): HttpClient {
			throw new RivaScopeError(
				"A free fetcher uses httpyz, which is server-only: in the browser, call it through an operation of the API's spec (query(api, ...)) served by operations() on /_data, or run it in a loader.",
			);
		},
		call: (route, input, { signal }) =>
			postData(opts, `rest:${route.operationId}`, input, signal),
	};
}
