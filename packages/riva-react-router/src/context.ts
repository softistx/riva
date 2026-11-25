import { type Riva, RivaScopeError } from '@softistx/riva';
import { dehydrate, type Snapshot } from '@softistx/riva/ssr';
import { createContext, type RouterContextProvider } from 'react-router';

/** What the helpers need of a React Router context: its `get`. */
export type ContextLike = Pick<Readonly<RouterContextProvider>, 'get'>;

/** Holds the request's `Riva`; `rivaMiddleware` (from `/server`) sets it. */
export const rivaContext = createContext<Riva | null>(null);

/** The request's `Riva`; throws a `RivaScopeError` when `rivaMiddleware` did not run. */
export function rivaOf(context: ContextLike): Riva {
	const riva = context.get(rivaContext);
	if (!riva)
		throw new RivaScopeError(
			"No Riva in this request: add rivaMiddleware() from @softistx/riva-react-router/server to the root route's middleware.",
		);
	return riva;
}

/** The loader payload: the request riva's settled entries, under the `~riva` key the provider reads. */
export function riva(context: ContextLike): { readonly '~riva': Snapshot } {
	return { '~riva': dehydrate(rivaOf(context)) };
}
