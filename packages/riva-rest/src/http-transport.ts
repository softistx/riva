import type { HttpClient } from '@softistx/httpyz';
import type { OpenApiClient } from '@softistx/openapi-httpyz';
import { RivaHttpError, RivaRequestError } from '@softistx/riva';
import { toRivaError } from './errors';
import type { RestTransport } from './transport';

type Reply = { status: number; data?: unknown };
type ByOperation = (id: string, ...args: unknown[]) => Promise<Reply>;

// A transport that cannot run the call is a wiring mistake: retrying repeats it.
const unwired = (message: string) =>
	new RivaRequestError('RIVA_REST_UNWIRED', message, { retryable: false });

/**
 * The transport over an httpyz client and, for OpenAPI definitions, the
 * client `createOpenApiClient(http, operations)` made over it. A call goes
 * through `api.<method>(path, input, { signal })`, so the spec's validation,
 * decoding and the client's middleware, auth, retries and timeouts all apply.
 * The data of the 2xx reply is returned; a declared reply of another status
 * throws `RivaHttpError`; httpyz's errors are mapped by `toRivaError`.
 */
export function httpyzTransport(
	http: HttpClient,
	// biome-ignore lint/suspicious/noExplicitAny: any spec's client
	api?: OpenApiClient<any, any, any>,
): RestTransport {
	return {
		http,
		async call(route, input, { signal }) {
			if (!api)
				throw unwired(
					'This REST transport has no OpenAPI client: build it with httpyzTransport(http, api) to run OpenAPI definitions.',
				);
			const op = (api as unknown as { op?: ByOperation }).op;
			const known = (api.operations as unknown as Record<string, unknown>)?.[
				route.operationId
			];
			if (typeof op !== 'function' || !known)
				throw unwired(
					`riva-rest: the OpenAPI client has no ${route.method.toUpperCase()} ${route.path}.`,
				);
			try {
				const reply = await (route.hasInput
					? op.call(api, route.operationId, input ?? {}, { signal })
					: op.call(api, route.operationId, { signal }));
				if (reply.status < 200 || reply.status >= 300)
					throw new RivaHttpError(
						reply.status,
						`${route.method.toUpperCase()} ${route.path}: HTTP ${reply.status}`,
						{ cause: reply },
					);
				return reply.data;
			} catch (error) {
				throw toRivaError(error, signal);
			}
		},
	};
}
