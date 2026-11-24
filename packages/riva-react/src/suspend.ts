import type { Query, RivaClient } from '@softistx/riva';

// Per client, so a request's pending fetches die with its client.
const pending = new WeakMap<RivaClient, Map<string, Promise<void>>>();

/**
 * The one promise React waits on for a query entry: the core's `ensure`, held
 * until it settles so every render that suspends gets the same promise. A
 * failure is swallowed here; the next render reads it from the state.
 */
export function suspend(
	client: RivaClient,
	// biome-ignore lint/suspicious/noExplicitAny: any query definition
	def: Query<any, any, any>,
	key: string,
	vars: unknown,
): Promise<void> {
	const map = pending.get(client) ?? new Map<string, Promise<void>>();
	pending.set(client, map);
	let promise = map.get(key);
	if (!promise) {
		const entries = map;
		const done = () => void entries.delete(key);
		promise = (def.ensure as (c: RivaClient, v: unknown) => Promise<unknown>)(
			client,
			vars,
		).then(done, done);
		entries.set(key, promise);
	}
	return promise;
}
