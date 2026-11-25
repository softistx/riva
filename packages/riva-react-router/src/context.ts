import { type Riva, RivaScopeError } from '@softistx/riva';
import { dehydrate, type Snapshot } from '@softistx/riva/ssr';
import { createContext, type RouterContextProvider } from 'react-router';

/** What the helpers need of a React Router context: its `get`. */
export type ContextLike = Pick<Readonly<RouterContextProvider>, 'get'>;

/** Holds the request's `Riva`; `rivaMiddleware` (from `/server`) sets it. */
export const rivaContext = createContext<Riva | null>(null);

/**
 * Types `rivaOf` by your app's riva: augment it once, with the type of what
 * your `createRiva` returns.
 *
 * ```ts
 * declare module '@softistx/riva-react-router' {
 *   interface Register { riva: AppRiva }
 * }
 * ```
 *
 * Without it `rivaOf` returns the base `Riva`.
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled by module augmentation
export interface Register {}

/** The riva a register declares, or the base `Riva`. */
export type RivaFrom<R> = R extends { riva: infer T extends Riva } ? T : Riva;

/** What `rivaOf` returns: the `riva` of `Register`, else `Riva`. */
export type RegisteredRiva = RivaFrom<Register>;

/** The request's `Riva` (typed by `Register`); throws a `RivaScopeError` when `rivaMiddleware` did not run. */
export function rivaOf(context: ContextLike): RegisteredRiva {
	const riva = context.get(rivaContext);
	if (!riva)
		throw new RivaScopeError(
			"No Riva in this request: add rivaMiddleware() from @softistx/riva-react-router/server to the root route's middleware.",
		);
	return riva as RegisteredRiva;
}

/** The loader payload: the request riva's settled entries, under the `~riva` key the provider reads. */
export function riva(context: ContextLike): { readonly '~riva': Snapshot } {
	return { '~riva': dehydrate(rivaOf(context)) };
}
