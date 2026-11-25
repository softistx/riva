import type { DataOperation, DataSource } from '@softistx/riva';
import { type Route, transportOf } from '../transport';
import { PREFIX, SAFE } from '../wire';

/** What `operations` reads of an OpenAPI client: its operation table. */
export interface OperationsOf {
	readonly operations: object;
}

interface Entry {
	method: string;
	path: string;
	parameters?: readonly unknown[];
	body?: unknown;
}

/** The id the browser names an operation by: `rest:<operationId>`. */
export { PREFIX };

/**
 * The server side of `bffTransport`: runs the operations of an OpenAPI client
 * (`createOpenApiClient`) through the request client's REST transport
 * (`provideRest`), under the id `rest:<operationId>`. Only the spec's
 * operations are known; the browser sends an id and its input, never a URL. A
 * GET, HEAD or OPTIONS is a query, any other method a mutation.
 */
export function operations(api: OperationsOf): DataSource {
	const table = (api?.operations ?? {}) as Record<string, Entry>;
	const made = new Map<string, DataOperation>();
	return {
		find(id) {
			if (!id.startsWith(PREFIX)) return undefined;
			const operationId = id.slice(PREFIX.length);
			// An own key only: `__proto__` or `toString` are not operations.
			const entry = Object.hasOwn(table, operationId)
				? table[operationId]
				: undefined;
			if (!entry || typeof entry.method !== 'string') return undefined;
			let op = made.get(id);
			if (!op) {
				const route: Route = {
					method: entry.method,
					path: entry.path,
					operationId,
					hasInput:
						(entry.parameters?.length ?? 0) > 0 || entry.body !== undefined,
				};
				op = {
					kind: SAFE.has(entry.method) ? 'query' : 'mutation',
					run: async (client, variables, signal) =>
						transportOf(client).call(route, variables, { signal }),
				};
				made.set(id, op);
			}
			return op;
		},
	};
}

export type { DataOperation, DataSource };
