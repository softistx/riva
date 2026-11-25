import { type RivaClient, RivaScopeError } from '@softistx/riva';
import { dehydrate, type Snapshot } from '@softistx/riva/ssr';
import { createContext, type RouterContextProvider } from 'react-router';

/** What the helpers need of a React Router context: its `get`. */
export type ContextLike = Pick<Readonly<RouterContextProvider>, 'get'>;

/** Holds the request's `RivaClient`; `rivaMiddleware` (from `/server`) sets it. */
export const rivaContext = createContext<RivaClient | null>(null);

/** The request's `RivaClient`; throws a `RivaScopeError` when `rivaMiddleware` did not run. */
export function rivaOf(context: ContextLike): RivaClient {
	const client = context.get(rivaContext);
	if (!client)
		throw new RivaScopeError(
			"No RivaClient in this request: add rivaMiddleware() from @softistx/riva-react-router/server to the root route's middleware.",
		);
	return client;
}

/** The loader payload: the request client's settled entries, under the `~riva` key the provider reads. */
export function riva(context: ContextLike): { readonly '~riva': Snapshot } {
	return { '~riva': dehydrate(rivaOf(context)) };
}
