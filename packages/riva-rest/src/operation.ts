import type { OperationsShape } from '@softistx/openapi-httpyz';
import type { Route } from './transport';
import type { RouteOf, SpecOf } from './types';

const SAFE = new Set(['get', 'head', 'options']);

/** The route of `'get /invoices/{id}'`, the definition's id as well. */
export interface Operation extends Route {
	readonly id: string;
}

/**
 * Reads a route once, against the client's own operation table. Throws a
 * `TypeError` for a route that is not `'<method> <path>'`, that the spec has
 * no operation for, or whose method does not fit the definition: a query is
 * a read (GET, HEAD, OPTIONS, QUERY, or a POST that only reads), a mutation
 * is not a GET, HEAD or OPTIONS.
 */
export function operationOf<Ops extends OperationsShape<Ops>>(
	spec: SpecOf<Ops>,
	route: RouteOf<Ops>,
	kind: 'query' | 'mutation',
): Operation {
	const at = route.indexOf(' ');
	const method = at > 0 ? route.slice(0, at) : '';
	const path = at > 0 ? route.slice(at + 1) : '';
	if (!method || !path.startsWith('/'))
		throw new TypeError(
			`riva-rest: "${route}" is not a route; write it as '<method> <path>' (get /invoices/{id}).`,
		);
	const table = (spec?.operations ?? {}) as Record<
		string,
		{ method: string; path: string }
	>;
	if (!Object.values(table).some((o) => o.method === method && o.path === path))
		throw new TypeError(
			`riva-rest: the OpenAPI client has no operation at ${method.toUpperCase()} ${path}; check the path as the spec writes it.`,
		);
	if (kind === 'query' && ['put', 'patch', 'delete'].includes(method))
		throw new TypeError(
			`riva-rest: ${method.toUpperCase()} ${path} changes data; define it with mutation(), not query().`,
		);
	if (kind === 'mutation' && SAFE.has(method))
		throw new TypeError(
			`riva-rest: ${method.toUpperCase()} ${path} only reads; define it with query(), not mutation().`,
		);
	return { id: `${method} ${path}`, method, path };
}
