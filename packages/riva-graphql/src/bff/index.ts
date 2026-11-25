import { type BffTransportOptions, postData } from '@softistx/riva/data';
import type { GraphQLTransport } from '../transport';

export type { BffTransportOptions };

/**
 * The browser's transport: posts `{ id, variables }` to a `dataRoute` and
 * reads `{ data }` back, Dates included. The route's refusals and the API's
 * errors come back as `RivaRequestError` with the route's `code` and `status`
 * (retryable for 5xx, 408 and 429); a failed fetch is a `RivaNetworkError`, an
 * abort a `RivaAbortError`, a body that is not the route's JSON
 * `RIVA_INVALID_RESPONSE` (see `postData` in `@softistx/riva/data`). Cookies
 * of the same origin go with the call.
 */
export function bffTransport(opts: BffTransportOptions = {}): GraphQLTransport {
	return {
		execute: (operation, variables, { signal }) =>
			postData(opts, operation.id, variables, signal) as never,
	};
}
