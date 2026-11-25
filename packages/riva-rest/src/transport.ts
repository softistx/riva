import type { HttpClient } from '@softistx/httpyz';
import { type FetchContext, type Riva, RivaScopeError } from '@softistx/riva';

/** Which operation to call, as found in the client's table when the definition was made. */
export interface Route {
	/** The method, lowercase. */
	readonly method: string;
	/** The path as the spec writes it. */
	readonly path: string;
	/** The operation's `operationId`, the key of the client's table. */
	readonly operationId: string;
	/** Whether the operation takes an input (parameters or a body). */
	readonly hasInput: boolean;
}

/**
 * Runs one OpenAPI operation. `@softistx/riva-rest` ships `httpyzTransport`;
 * any object of this shape works (a transport that posts to a BFF route, a
 * test double). It resolves with the data of the 2xx reply and throws
 * `RivaError`s.
 */
export interface RestTransport {
	/** The httpyz client, handed to free fetchers; absent on a transport that has none. */
	readonly http?: HttpClient;
	call(
		route: Route,
		input: unknown,
		options: { signal: AbortSignal },
	): Promise<unknown>;
}

// Held on the riva's slots: the transport of a request dies with its riva.
const SLOT = {};

/** Gives `riva` the transport its REST definitions fetch through. */
export function provideRest(riva: Riva, transport: RestTransport): void {
	riva.slots.set(SLOT, transport);
}

/** The transport `provideRest` gave `riva`; throws `RivaScopeError` when none. */
export function transportOf(riva: Riva): RestTransport {
	const transport = riva.slots.get(SLOT) as RestTransport | undefined;
	if (!transport)
		throw new RivaScopeError(
			'No REST transport on this Riva: call provideRest(riva, httpyzTransport(http, api)) when you create it.',
		);
	return transport;
}

/** What a free fetcher receives: the core's context, and the riva's httpyz instance. */
export interface RestContext extends FetchContext {
	/** The httpyz client of the transport; reading it with none provided throws `RivaScopeError`. */
	readonly http: HttpClient;
}

/** The core's context, with `http` read from the riva's transport when the fetcher asks for it. */
export const restContext = (ctx: FetchContext): RestContext =>
	Object.defineProperty({ ...ctx }, 'http', {
		enumerable: true,
		get(): HttpClient {
			const { http } = transportOf(ctx.riva);
			if (!http)
				throw new RivaScopeError(
					'The REST transport of this Riva holds no httpyz client: build it with httpyzTransport(http, api).',
				);
			return http;
		},
	}) as RestContext;
