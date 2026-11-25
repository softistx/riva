import type { Riva } from './client';
import { RivaScopeError } from './errors';

// Transient execution context (the riva of the running `riva.run`) and the
// browser's default riva. The server never holds a default: it would leak
// between requests.
let current: Riva | undefined;
let fallback: Riva | undefined;

/** Browser detection, in one place so tests can drive it through `globalThis.document`. */
export const isBrowser = (): boolean => 'document' in globalThis;

/** The riva in scope, if any. */
export const active = (): Riva | undefined =>
	current ?? resolver?.() ?? (isBrowser() ? fallback : undefined);

let resolver: (() => Riva | undefined) | undefined;

/** Sets the ambient resolver `@softistx/riva/ssr` exposes. @internal */
export const setResolver = (fn: typeof resolver): void => {
	resolver = fn;
};

/** The riva in scope, or a `RivaScopeError` naming the fix. */
export function resolve(): Riva {
	const riva = active();
	if (!riva)
		throw new RivaScopeError(
			'No Riva in scope: read through riva.get(def), or wrap the code in riva.run(() => …). On the server, use the per-request riva.',
		);
	return riva;
}

/** Runs `fn` with `riva` as the ambient scope, restoring the previous one after. */
export function withRiva<R>(riva: Riva, fn: () => R): R {
	const previous = current;
	current = riva;
	try {
		return fn();
	} finally {
		current = previous;
	}
}

/** Sets the browser's default riva. Throws on the server. */
export function setDefaultRiva(riva: Riva | undefined): void {
	if (!isBrowser())
		throw new RivaScopeError(
			'setDefaultRiva is browser-only: a module-level riva on the server would leak state between requests. Use the per-request riva with riva.run(() => …).',
		);
	fallback = riva;
}
