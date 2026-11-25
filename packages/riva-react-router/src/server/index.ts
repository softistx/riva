import { AsyncLocalStorage } from 'node:async_hooks';
import { createRiva, type Riva, RivaScopeError } from '@softistx/riva';
import { setScopeResolver } from '@softistx/riva/ssr';
import type { MiddlewareFunction, RouterContextProvider } from 'react-router';
import { rivaContext } from '../context';

// The one module-level state of this package, by design: the ambient scope
// of a server request must follow its async work, and `setScopeResolver` is
// one per process. It holds a request's riva only while `next()` runs.
const als = new AsyncLocalStorage<Riva>();
setScopeResolver(() => als.getStore());

export type MiddlewareArgs = Parameters<MiddlewareFunction>[0];

export interface RivaMiddlewareOptions {
	/** Makes the request's riva. By default `createRiva()`. */
	create?: (args: MiddlewareArgs) => Riva;
	/** Wires the riva before the loaders run: the caller port of the request (e.g. `provideGraphQL`). */
	setup?: (
		riva: Riva,
		args: { request: Request; context: Readonly<RouterContextProvider> },
	) => void | Promise<void>;
}

/**
 * Root-route middleware: one `Riva` per request, in the router context
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
		const riva = opts.create?.(args) ?? createRiva();
		await opts.setup?.(riva, { request, context });
		context.set(rivaContext, riva);
		return als.run(riva, next);
	};
}

export {
	type DataOperation,
	type DataRoute,
	type DataRouteCode,
	type DataRouteOptions,
	type DataSource,
	dataRoute,
} from './data-route';
