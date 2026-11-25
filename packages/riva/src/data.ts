import type { RivaClient } from './client';

/** One operation a `/_data` route may run for the browser. */
export interface DataOperation {
	readonly kind: 'query' | 'mutation';
	/** Runs it on the request's client, with the caller's variables (decoded). */
	run(
		client: RivaClient,
		variables: unknown,
		signal: AbortSignal,
	): Promise<unknown>;
}

/** A set of operations by id: an allowlist. An id it does not know is not run. */
export interface DataSource {
	find(id: string): DataOperation | undefined;
}
