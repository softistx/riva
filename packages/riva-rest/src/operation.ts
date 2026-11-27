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
 * What a definition's first argument is read against: an OpenAPI client or
 * spec (anything with `operations`) as is, or a bare generated operations
 * table (an object holding an entry with a string `method` and `path`) wrapped
 * as `{ operations }`. `undefined` for anything else, which the caller reads as
 * free options (`{ id, fetch }`, `{ id, mutate }`); free options win when
 * `fetch` or `mutate` is a function.
 */
export function specOf<Ops extends OperationsShape<Ops>>(
	first: unknown,
): SpecOf<Ops> | undefined {
	const o = first as Record<string, { method?: unknown; path?: unknown }>;
	if (!o || typeof o !== 'object') return undefined;
	if ('operations' in o) return o as unknown as SpecOf<Ops>;
	if (typeof (o['fetch'] ?? o['mutate']) !== 'function')
		for (const v of Object.values(o))
			if (v?.method && v.path) return { operations: o } as never;
	return undefined;
}

/**
 * Reads a route once, against the spec's operation table. Throws a
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
			`riva-rest: no OpenAPI operation at ${method.toUpperCase()} ${path}; check the path as the spec writes it.`,
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
