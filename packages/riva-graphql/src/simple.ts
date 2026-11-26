import type { GraphQLClient } from '@softistx/graphql-client';
import type {
	CachePolicy,
	Query,
	Riva,
	RivaExtension,
	VarsArgs,
} from '@softistx/riva';
import type {
	MutationHandle,
	Resource,
	StreamResource,
	TrackedInput,
} from '@softistx/riva/resource';
import {
	callsOf,
	type Doc,
	type GraphQLMutateCall,
	type GraphQLQueryCall,
} from './calls';
import { graphqlClientTransport } from './client-transport';
import type { OperationCache } from './query';
import { type GraphQLSubscribeCall, subscriptionOf } from './subscription';
import { type GraphQLTransport, provideGraphQL } from './transport';
import type { TargetData, TargetVars, VarsOf } from './types';

export type { GraphQLMutateCall, GraphQLQueryCall } from './calls';
export type { GraphQLSubscribeCall } from './subscription';

/** What `createRiva({ graphql: withGraphQL(client) })` puts on `riva.graphql`. */
export interface GraphQLApi {
	/**
	 * A reactive resource over a query: `state`, `subscribe`, and awaitable
	 * (`await riva.graphql.query(DOC, vars)` gives the data or throws). The
	 * variables are a plain value, a riva signal or computed, or a function that
	 * reads signals; the key is the operation name plus the variables. Lazy: it
	 * fetches at its first subscriber or observed reader, `await` is a one-shot
	 * load. A response with data and errors is the `error` state with the partial
	 * `data` and a `RivaGraphQLError`. A query definition (from `query(DOC)`) is used
	 * as is, so a loader's `ensure(riva, def, vars)` and this call share one cache
	 * entry.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: matches any document or definition
	query<T extends Doc<any, any> | Query<any, any>>(
		target: T,
		...args: VarsArgs<TrackedInput<TargetVars<T>>, [options?: GraphQLQueryCall]>
	): Resource<TargetData<T>>;
	/** Runs a mutation and resolves with its data; throws after the rollback. */
	mutate<Data, Vars>(
		document: Doc<Data, Vars>,
		...args: VarsArgs<VarsOf<Vars>, [options?: GraphQLMutateCall]>
	): Promise<Data>;
	/** A callable handle over a mutation: `await save(vars)`, a reactive `state` (idle first) and `reset()`. Each call of `mutation` makes its own handle. */
	mutation<Data, Vars>(
		document: Doc<Data, Vars>,
	): MutationHandle<VarsOf<Vars>, Data, GraphQLMutateCall>;
	/**
	 * A resource over a subscription: `loading` until the first result, then
	 * `success` with the last one, or `error`. Lazy: the first reader opens the
	 * stream and the last one stops it; tracked variables that change restart it,
	 * equal ones do not. Throws when the transport cannot subscribe.
	 */
	subscribe<Data, Vars>(
		document: Doc<Data, Vars>,
		...args: VarsArgs<
			TrackedInput<VarsOf<Vars>>,
			[callbacks?: GraphQLSubscribeCall<Data>]
		>
	): StreamResource<Data>;
}

export interface GraphQLSimpleOptions {
	/** Stores the data of every call: a core policy, or `normalized()` from `@softistx/riva-graphql/cache`. Default: as is. */
	cache?: CachePolicy | OperationCache;
}

/**
 * The GraphQL extension of `createRiva`: `createRiva({ graphql: withGraphQL(client) })`
 * gives `riva.graphql.query / mutate / subscribe`, which take a typed document
 * and its variables and return the data. The first argument is a
 * `@softistx/graphql-client` client or any `GraphQLTransport` (told apart by
 * the client's `mutate` method: a transport must not define one). Definitions made
 * with `query()` and `mutation()` keep working on the same riva.
 */
export function withGraphQL(
	source: GraphQLClient | GraphQLTransport,
	options: GraphQLSimpleOptions = {},
): RivaExtension<GraphQLApi> {
	const transport =
		'mutate' in source ? graphqlClientTransport(source) : source;
	return {
		install(riva: Riva): GraphQLApi {
			provideGraphQL(riva, transport);
			const calls = callsOf(riva, options.cache);
			return {
				query: (doc: never, vars?: unknown, call?: GraphQLQueryCall) =>
					calls.query(doc, vars, call) as never,
				mutate: calls.mutate as never,
				mutation: (doc) => calls.mutation(doc as never) as never,
				subscribe: (doc, vars?, on?: GraphQLSubscribeCall<never>) =>
					subscriptionOf(
						riva,
						transport,
						options.cache,
						doc as never,
						vars,
						on,
					) as never,
			};
		},
	};
}
