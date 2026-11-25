import type { OperationsShape } from '@softistx/openapi-httpyz';
import { RivaError } from '@softistx/riva';
import type { Route } from './transport';
import type { RouteOf, SpecOf } from './types';
import { SAFE } from './wire';

/** What a route is read into: the transport's `Route`, and the definition's id (`'get /invoices/{id}'`). */
export interface Operation extends Route {
	readonly id: string;
}

/**
 * Reads a route once, against the client's own operation table. Throws a
 * `RivaError` (`RIVA_DEFINITION`) for a route that is not `'<method> <path>'`, that the spec has
 * no operation for, or whose method does not fit the definition: a query is
 * a read (GET, HEAD, OPTIONS, QUERY, or a POST that only reads), a mutation
 * is not a GET, HEAD or OPTIONS.
 */
export function operationOf<Ops extends OperationsShape<Ops>>(
	spec: SpecOf<Ops>,
	route: RouteOf<Ops>,
	kind: 'query' | 'mutation',
): Operation {
	if (typeof route !== 'string')
		throw new RivaError(
			'RIVA_DEFINITION',
			`riva-rest: ${String(route)} is not a route; write it as '<method> <path>' (get /invoices/{id}).`,
		);
	const at = route.indexOf(' ');
	const method = at > 0 ? route.slice(0, at) : '';
	const path = at > 0 ? route.slice(at + 1) : '';
	if (!method || !path.startsWith('/'))
		throw new RivaError(
			'RIVA_DEFINITION',
			`riva-rest: "${route}" is not a route; write it as '<method> <path>' (get /invoices/{id}).`,
		);
	const table = (spec?.operations ?? {}) as unknown as Record<
		string,
		{ method: string; path: string; parameters?: unknown[]; body?: unknown }
	>;
	const found = Object.entries(table).find(
		([, o]) => o.method === method && o.path === path,
	);
	if (!found)
		throw new RivaError(
			'RIVA_DEFINITION',
			`riva-rest: the OpenAPI client has no operation at ${method.toUpperCase()} ${path}; check the path as the spec writes it.`,
		);
	if (kind === 'query' && ['put', 'patch', 'delete'].includes(method))
		throw new RivaError(
			'RIVA_DEFINITION',
			`riva-rest: ${method.toUpperCase()} ${path} changes data; define it with mutation(), not query().`,
		);
	if (kind === 'mutation' && SAFE.has(method))
		throw new RivaError(
			'RIVA_DEFINITION',
			`riva-rest: ${method.toUpperCase()} ${path} only reads; define it with query(), not mutation().`,
		);
	const [operationId, entry] = found;
	return {
		id: `${method} ${path}`,
		method,
		path,
		operationId,
		hasInput: (entry.parameters?.length ?? 0) > 0 || entry.body !== undefined,
	};
}
