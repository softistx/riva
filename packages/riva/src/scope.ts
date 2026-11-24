import type { RivaClient } from './client';
import { RivaScopeError } from './errors';

// Transient execution context (the client of the running `client.run`) and the
// browser's default client. The server never holds a default: it would leak
// between requests.
let current: RivaClient | undefined;
let fallback: RivaClient | undefined;

/** Browser detection, in one place so tests can drive it through `globalThis.document`. */
export const isBrowser = (): boolean => 'document' in globalThis;

/** The client in scope, if any. */
export const active = (): RivaClient | undefined =>
	current ?? (isBrowser() ? fallback : undefined);

/** The client in scope, or a `RivaScopeError` naming the fix. */
export function resolve(): RivaClient {
	const client = active();
	if (!client)
		throw new RivaScopeError(
			'No RivaClient in scope: read through client.get(def), or wrap the code in client.run(() => …). On the server, use the per-request client.',
		);
	return client;
}

/** Runs `fn` with `client` as the ambient scope, restoring the previous one after. */
export function withClient<R>(client: RivaClient, fn: () => R): R {
	const previous = current;
	current = client;
	try {
		return fn();
	} finally {
		current = previous;
	}
}

/** Sets the browser's default client. Throws on the server. */
export function setDefaultClient(client: RivaClient | undefined): void {
	if (!isBrowser())
		throw new RivaScopeError(
			'setDefaultClient is browser-only: a module-level client on the server would leak state between requests. Use the per-request client with client.run(() => …).',
		);
	fallback = client;
}
