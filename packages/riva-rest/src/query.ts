import type { OperationsShape, OperationTable } from '@softistx/openapi-httpyz';
import {
	type CachePolicy,
	mutation as coreMutation,
	query as coreQuery,
	type FetchContext,
	type Mutation,
	type MutationOptions,
	type Query,
	type QueryOptions,
	RivaError,
} from '@softistx/riva';
import { toRivaError } from './errors';
import { operationOf, specOf } from './operation';
import {
	type RestContext,
	type Route,
	restContext,
	transportOf,
} from './transport';
import type {
	ClientOf,
	DataOf,
	DecodedOf,
	InputOf,
	MutationRoute,
	QueryRoute,
} from './types';

/** The core's query options, minus what the route gives. */
export type RestQueryOptions<Vars, Data> = Omit<
	QueryOptions<Vars, Data>,
	'id' | 'fetch' | 'derive'
> & {
	/** Replaces the id derived from the route (to define one route twice with different options). */
	id?: string;
};

export type RestMutationOptions<Vars, Data> = Omit<
	MutationOptions<Vars, Data>,
	'id' | 'mutate'
> & {
	/** Replaces the id derived from the route. */
	id?: string;
};

/** A query over a function you write, for an API with no schema. */
export type FreeQueryOptions<Vars, Data> = Omit<
	QueryOptions<Vars, Data>,
	'fetch' | 'derive'
> & {
	/** The cache key's base: required, since a function has no name to derive one from. */
	id: string;
	/** Fetches the data. Errors it throws from httpyz are mapped to riva's. */
	fetch: (vars: Vars, ctx: RestContext) => Promise<Data>;
};

export type FreeMutationOptions<Vars, Data> = Omit<
	MutationOptions<Vars, Data>,
	'mutate'
> & {
	id: string;
	mutate: (vars: Vars, ctx: RestContext) => Promise<Data>;
};

export const callOf =
	(route: Route) =>
	async (vars: unknown, ctx: FetchContext): Promise<unknown> =>
		transportOf(ctx.riva).call(route, vars, { signal: ctx.signal });

const guarded =
	<Vars, Data>(fn: (vars: Vars, ctx: RestContext) => Promise<Data>) =>
	async (vars: Vars, ctx: FetchContext): Promise<Data> => {
		try {
			return await fn(vars, restContext(ctx));
		} catch (error) {
			throw toRivaError(error, ctx.signal);
		}
	};

function freeId(opts: { id?: unknown }, name: string): void {
	if (typeof opts?.id !== 'string' || !opts.id)
		throw new RivaError(
			'RIVA_DEFINITION',
			`riva-rest: ${name}() needs an id; a function has no name to derive one from.`,
		);
}

/**
 * A query definition. Three forms:
 *
 * - `query(operations, 'get /invoices/{id}', opts?)`: from the generated
 *   `operations` table alone, so a definition module imports no client (the
 *   transport brings it at run time). The data is typed as the decoded reply,
 *   what a client with the default `decode: true` returns; for a client built
 *   with `decode: false`, use the client form to get the JSON-typed data.
 * - `query(api, 'get /invoices/{id}', opts?)`: from an OpenAPI client
 *   (`createOpenApiClient`); the variables are the operation's input and the
 *   data its 2xx reply, both typed from the spec, and the id is the route.
 *   Throws a `RivaError` (`RIVA_DEFINITION`) for a route the client's spec does not have.
 * - `query({ id, fetch })`: a free fetcher for an API with no schema, typed
 *   by the generics or the fetcher's own types.
 */
export function query<
	Ops extends OperationsShape<Ops>,
	Api extends ClientOf<Ops, boolean>,
	R extends QueryRoute<Ops>,
>(
	api: Api & ClientOf<Ops, boolean>,
	route: R,
	opts?: RestQueryOptions<InputOf<Ops, R>, DataOf<Ops, R, DecodedOf<Ops, Api>>>,
): Query<InputOf<Ops, R>, DataOf<Ops, R, DecodedOf<Ops, Api>>>;
export function query<
	Ops extends OperationsShape<Ops>,
	R extends QueryRoute<Ops>,
>(
	table: OperationTable<Ops>,
	route: R,
	opts?: RestQueryOptions<InputOf<Ops, R>, DataOf<Ops, R, true>>,
): Query<InputOf<Ops, R>, DataOf<Ops, R, true>>;
export function query<Vars = void, Data = unknown>(
	opts: FreeQueryOptions<Vars, Data>,
): Query<Vars, Data>;
export function query(
	first: unknown,
	route?: string,
	opts: { id?: string } = {},
): unknown {
	const spec = specOf(first);
	if (!spec) {
		freeId(first as { id?: unknown }, 'query');
		const { fetch, ...rest } = first as unknown as FreeQueryOptions<
			unknown,
			unknown
		>;
		return coreQuery({ ...rest, fetch: guarded(fetch) });
	}
	const op = operationOf(spec, route as never, 'query');
	return coreQuery({
		...(opts as object),
		id: opts.id ?? op.id,
		fetch: callOf(op),
	} as QueryOptions<unknown, unknown>);
}

/**
 * A mutation definition, in the same three forms as `query`:
 * `mutation(operations, 'post /invoices', opts?)`, `mutation(api, 'post /invoices', opts?)`
 * or `mutation({ id, mutate })`.
 */
export function mutation<
	Ops extends OperationsShape<Ops>,
	Api extends ClientOf<Ops, boolean>,
	R extends MutationRoute<Ops>,
>(
	api: Api & ClientOf<Ops, boolean>,
	route: R,
	opts?: RestMutationOptions<
		InputOf<Ops, R>,
		DataOf<Ops, R, DecodedOf<Ops, Api>>
	>,
): Mutation<InputOf<Ops, R>, DataOf<Ops, R, DecodedOf<Ops, Api>>>;
export function mutation<
	Ops extends OperationsShape<Ops>,
	R extends MutationRoute<Ops>,
>(
	table: OperationTable<Ops>,
	route: R,
	opts?: RestMutationOptions<InputOf<Ops, R>, DataOf<Ops, R, true>>,
): Mutation<InputOf<Ops, R>, DataOf<Ops, R, true>>;
export function mutation<Vars = void, Data = unknown>(
	opts: FreeMutationOptions<Vars, Data>,
): Mutation<Vars, Data>;
export function mutation(
	first: unknown,
	route?: string,
	opts: { id?: string } = {},
): unknown {
	const spec = specOf(first);
	if (!spec) {
		freeId(first as { id?: unknown }, 'mutation');
		const { mutate, ...rest } = first as unknown as FreeMutationOptions<
			unknown,
			unknown
		>;
		return coreMutation({ ...rest, mutate: guarded(mutate) });
	}
	const op = operationOf(spec, route as never, 'mutation');
	return coreMutation({
		...(opts as object),
		id: opts.id ?? op.id,
		mutate: callOf(op),
	} as MutationOptions<unknown, unknown>);
}

export type { CachePolicy };
