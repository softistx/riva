import { AsyncLocalStorage } from 'node:async_hooks';
import {
	createRivaClient,
	type RivaClient,
	RivaScopeError,
} from '@softistx/riva';
import { setScopeResolver } from '@softistx/riva/ssr';
import type { MiddlewareFunction, RouterContextProvider } from 'react-router';
import { rivaContext } from '../context';

// The one module-level state of this package, by design: the ambient scope
// of a server request must follow its async work, and `setScopeResolver` is
// one per process. It holds a request's client only while `next()` runs.
const als = new AsyncLocalStorage<RivaClient>();
setScopeResolver(() => als.getStore());

export type MiddlewareArgs = Parameters<MiddlewareFunction>[0];

export interface RivaMiddlewareOptions {
	/** Makes the request's client. By default `createRivaClient()`. */
	create?: (args: MiddlewareArgs) => RivaClient;
	/** Wires the client before the loaders run: the caller port of the request (e.g. `provideGraphQL`). */
	setup?: (
		client: RivaClient,
		args: { request: Request; context: Readonly<RouterContextProvider> },
	) => void | Promise<void>;
}

/**
 * Root-route middleware: one `RivaClient` per request, in the router context
 * (`rivaOf(context)`) and as the ambient scope of the whole request, so
 * `signal.get()` and `def.ensure` resolve after an `await` in a loader.
 */
export function rivaMiddleware<Result = unknown>(
	opts: RivaMiddlewareOptions = {},
): MiddlewareFunction<Result> {
	return async (args, next) => {
		const { request, context } = args;
		if (context.get(rivaContext))
			throw new RivaScopeError(
				'rivaMiddleware ran twice in one request: declare it once, on the root route.',
			);
		const client = opts.create?.(args) ?? createRivaClient();
		await opts.setup?.(client, { request, context });
		context.set(rivaContext, client);
		return als.run(client, next);
	};
}

export {
	type DataOperation,
	type DataRoute,
	type DataRouteOptions,
	type DataSource,
	dataRoute,
} from './data-route';
