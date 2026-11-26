import {
	type CachePolicy,
	mutation as coreMutation,
	query as coreQuery,
	type Duration,
	type Invalidation,
	type Mutation,
	type Query,
	type Riva,
} from '@softistx/riva';
import {
	callResource,
	mutateInvalidating,
	mutationHandle,
	trackedInput,
} from '@softistx/riva/resource';
import { callOf } from './query';
import type { InputArg } from './resources';
import type { Route } from './transport';

/** Options of one `riva.rest.get` call. */
export interface GetCall {
	/** Replaces the riva's default `staleTime` for this call: data younger than it is returned without fetching. */
	staleTime?: Duration;
	/** A boolean, or a function read in a tracked computed. While false the state is `idle`, the input function is not called and nothing is fetched. Default true. */
	enabled?: boolean | (() => boolean);
	/** While a new input loads, show the previous one's data (`placeholder: true`). Default true. */
	keepPrevious?: boolean;
	/** Stops waiting on `await` when it aborts (rejects with a `RivaAbortError`); the shared fetch is not cancelled. */
	signal?: AbortSignal;
}

/** Options of one mutation call (`riva.rest.post` and the others, or a handle's call). */
export interface MutateCall {
	/**
	 * An array (no function form) marked stale once the mutation succeeded;
	 * observed ones refetch. A string is the path of a `riva.rest.get`, every
	 * input of it (`'/invoices'`, or `'/invoices/{id}'` as the spec writes it);
	 * a hand-made `query()` definition or `at(query, vars)` targets its own entries.
	 */
	invalidates?: readonly (string | Invalidation)[];
	signal?: AbortSignal;
}

/** Turns `'<method> <path>'` into the `Route` the transport runs, or throws. */
export type Resolve = (
	method: string,
	path: string,
	kind: 'query' | 'mutation',
) => Route & { id: string };

interface Memo {
	queries: Map<string, Query<unknown, unknown>>;
	mutations: Map<string, Mutation<unknown, unknown>>;
}

/** The get, mutate and mutation calls of one riva, over the definitions it memoises per method and path. */
export function callsOf(
	riva: Riva,
	resolve: Resolve,
	cache: CachePolicy | undefined,
) {
	const defaults = cache ? { cache } : {};
	const memo: Memo = { queries: new Map(), mutations: new Map() };
	// Ids prefixed `rest:`: a hand-made query(api, route) on the same riva keeps its own cache entries.
	const queryOf = (path: string) => {
		const op = resolve('get', path, 'query');
		let def = memo.queries.get(op.id);
		if (!def) {
			def = coreQuery({ ...defaults, id: `rest:${op.id}`, fetch: callOf(op) });
			memo.queries.set(op.id, def);
		}
		return def;
	};
	const mutationOf = (method: string, path: string) => {
		const op = resolve(method, path, 'mutation');
		let def = memo.mutations.get(op.id);
		if (!def) {
			def = coreMutation({ ...defaults, id: `rest:${op.id}`, run: callOf(op) });
			memo.mutations.set(op.id, def);
		}
		return def;
	};
	const mutate = async (
		method: string,
		path: string,
		input?: unknown,
		call?: MutateCall,
	) =>
		mutateInvalidating(riva, mutationOf(method, path), input, call, (t) =>
			typeof t === 'string' ? queryOf(t) : t,
		);
	return {
		mutate,
		get(
			target: string | Query<unknown, unknown>,
			input?: InputArg<unknown>,
			call?: GetCall,
		) {
			const def = typeof target === 'string' ? queryOf(target) : target;
			return callResource(riva, def, trackedInput(riva, input), call);
		},
		mutation(method: string, path: string) {
			mutationOf(method, path); // an unknown route throws now, not at the first save
			return mutationHandle(riva, (input: unknown, call?: MutateCall) =>
				mutate(method, path, input, call),
			);
		},
	};
}
