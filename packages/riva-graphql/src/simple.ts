import type { GraphQLClient } from '@softistx/graphql-client';
import type {
	CachePolicy,
	Riva,
	RivaExtension,
	VarsArgs,
} from '@softistx/riva';
import type {
	MutationHandle,
	Resource,
	StreamResource,
} from '@softistx/riva/resource';
import { callsOf, type Doc, type MutateCall, type QueryCall } from './calls';
import { graphqlClientTransport } from './client-transport';
import type { OperationCache } from './query';
import type { VarsInput } from './resources';
import { type SubscribeCall, subscriptionOf } from './subscription';
import { type GraphQLTransport, provideGraphQL } from './transport';
import type { VarsOf } from './types';

export type { MutateCall, QueryCall } from './calls';
export type { SubscribeCall } from './subscription';

/** What `createRiva({ graphql: graphql(client) })` puts on `riva.graphql`. */
export interface GraphQLApi {
	/**
	 * A reactive resource over a query: `state`, `subscribe`, and awaitable
	 * (`await riva.graphql.query(DOC, vars)` gives the data or throws). The
	 * variables are a plain value, a riva signal or computed, or a function that
	 * reads signals; the key is the operation name plus the variables. Lazy: it
	 * fetches at its first subscriber or observed reader, `await` is a one-shot
	 * load. A response with data and errors is the `error` state with the partial
	 * `data` and a `GraphQLError`.
	 */
	query<Data, Vars>(
		document: Doc<Data, Vars>,
		...args: VarsArgs<VarsInput<VarsOf<Vars>>, [options?: QueryCall]>
	): Resource<Data>;
	/** Runs a mutation and resolves with its data; throws after the rollback. */
	mutate<Data, Vars>(
		document: Doc<Data, Vars>,
		...args: VarsArgs<VarsOf<Vars>, [options?: MutateCall]>
	): Promise<Data>;
	/** A callable handle over a mutation: `await save(vars)`, a reactive `state` (idle first) and `reset()`. Each call of `mutation` makes its own handle. */
	mutation<Data, Vars>(
		document: Doc<Data, Vars>,
	): MutationHandle<VarsOf<Vars>, Data, MutateCall>;
	/**
	 * A resource over a subscription: `loading` until the first result, then
	 * `success` with the last one, or `error`. Lazy: the first reader opens the
	 * stream and the last one stops it; tracked variables that change restart it,
	 * equal ones do not. Throws when the transport cannot subscribe.
	 */
	subscribe<Data, Vars>(
		document: Doc<Data, Vars>,
		...args: VarsArgs<
			VarsInput<VarsOf<Vars>>,
			[callbacks?: SubscribeCall<Data>]
		>
	): StreamResource<Data>;
}

export interface GraphQLSimpleOptions {
	/** Stores the data of every call: a core policy, or `normalized()` from `@softistx/riva-graphql/cache`. Default: as is. */
	cache?: CachePolicy | OperationCache;
}

/**
 * The GraphQL extension of `createRiva`: `createRiva({ graphql: graphql(client) })`
 * gives `riva.graphql.query / mutate / subscribe`, which take a typed document
 * and its variables and return the data. The first argument is a
 * `@softistx/graphql-client` client or any `GraphQLTransport` (told apart by
 * the client's `mutate` method: a transport must not define one). Definitions made
 * with `query()` and `mutation()` keep working on the same riva.
 */
export function graphql(
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
				query: (doc, vars?, call?: QueryCall) =>
					calls.query(doc as never, vars, call) as never,
				mutate: calls.mutate as never,
				mutation: (doc) => calls.mutation(doc as never) as never,
				subscribe: (doc, vars?, on?: SubscribeCall<never>) =>
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
