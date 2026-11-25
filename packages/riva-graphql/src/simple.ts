import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { GraphQLClient } from '@softistx/graphql-client';
import {
	type CachePolicy,
	type Duration,
	type Invalidation,
	type Mutation,
	type Query,
	type Riva,
	RivaError,
	type RivaExtension,
	type VarsArgs,
} from '@softistx/riva';
import {
	type MutationHandle,
	mutationHandle,
	type Resource,
	resource,
	type StreamResource,
	streamResource,
} from '@softistx/riva/resource';
import { graphqlClientTransport } from './client-transport';
import { toRivaError } from './errors';
import { operationOf } from './operation';
import { mutation, type OperationCache, query } from './query';
import {
	graphqlResource,
	memoFactory,
	type VarsInput,
	varsReader,
} from './resources';
import { type GraphQLTransport, provideGraphQL } from './transport';
import type { VarsOf } from './types';

type Doc<Data, Vars> = TypedDocumentNode<Data, Vars>;

/** Options of one `riva.graphql.query` call. */
export interface QueryCall {
	/** Replaces the riva's default `staleTime` for this call: data younger than it is returned without fetching. */
	staleTime?: Duration;
	/** A boolean, or a function read in a tracked computed. While false the state is `idle`, the variables function is not called and nothing is fetched. Default true. */
	enabled?: boolean | (() => boolean);
	/** While new variables load, show the previous ones' data (`placeholder: true`). Default true. */
	keepPrevious?: boolean;
	/** Stops waiting on `await` when it aborts (rejects with a `RivaAbortError`); the shared fetch is not cancelled. */
	signal?: AbortSignal;
}

/** Options of one `riva.graphql.mutate` call. */
export interface MutateCall {
	/**
	 * An array (no function form) of documents, definitions or `at(query, vars)` to mark stale once the mutation succeeded; observed ones refetch.
	 * A document targets the query `riva.graphql.query` made of it; a hand-made definition targets its own entries only.
	 */
	invalidates?: readonly (Doc<unknown, never> | Invalidation)[];
	signal?: AbortSignal;
}

/** The options and callbacks of `riva.graphql.subscribe`, all optional. An error thrown by `next`, `error` or `complete` is raised outside the stream (never reported to `error`), and a throwing `next` ends it. */
export interface SubscribeCall<Data> {
	/** Each result, after it was merged into the cache when the cache can hold it. */
	next?(data: Data): void;
	/** A failure ends the subscription; a `RivaError` when the transport's error is known. */
	error?(error: unknown): void;
	/** The stream ended on its own (not after the last reader left, nor a failure). */
	complete?(): void;
	/** A boolean, or a function read in a tracked computed. While false the state is `idle` and nothing is opened. Default true. */
	enabled?: boolean | (() => boolean);
}

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

// Per riva, on its slots: the definitions its ad-hoc calls memoise by document.
const MEMO = {};

interface Memo {
	queries: Map<object, Query<never, unknown>>;
	mutations: Map<object, Mutation<never, unknown>>;
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
			const defaults = options.cache ? { cache: options.cache } : {};
			const memo: Memo = { queries: new Map(), mutations: new Map() };
			riva.slots.set(MEMO, memo);
			// Distinct ids: a hand-made query(DOC) on the same riva keeps its own cache entries.
			const idOf = (doc: Doc<unknown, never>) => ({
				...defaults,
				id: `graphql:${operationOf(doc).id}`,
			});
			const queryOf = (doc: Doc<unknown, never>) => {
				let def = memo.queries.get(doc);
				if (!def) {
					def = query(doc, idOf(doc)) as never;
					memo.queries.set(doc, def as never);
				}
				return def as Query<unknown, unknown>;
			};
			const mutationOf = (doc: Doc<unknown, never>) => {
				let def = memo.mutations.get(doc);
				if (!def) {
					def = mutation(doc, idOf(doc));
					memo.mutations.set(doc, def);
				}
				return def;
			};
			const mutate = async (
				doc: Doc<unknown, never>,
				vars?: unknown,
				call?: MutateCall,
			) => {
				const def = mutationOf(doc);
				// Resolved first: a bad entry throws before anything was written.
				const stale = (call?.invalidates ?? []).map((t) =>
					'definitions' in t
						? (
								(d) => () =>
									d.invalidate(riva)
							)(queryOf(t as never))
						: 'query' in t
							? () => t.query.invalidate(riva, t.vars)
							: () => (t as Query<unknown, unknown>).invalidate(riva),
				);
				const data = await (def.run as (...a: unknown[]) => Promise<never>)(
					riva,
					vars,
					{ signal: call?.signal },
				);
				for (const f of stale) f();
				return data;
			};
			return {
				query: (doc, vars?, call?: QueryCall) => {
					const def = queryOf(doc as never);
					const read = varsReader(riva, vars);
					const { enabled, keepPrevious, staleTime } = call ?? {};
					return graphqlResource(
						resource(riva, () => [def, read()] as never, {
							...(enabled !== undefined && { enabled }),
							...(keepPrevious !== undefined && { keepPrevious }),
							...(staleTime !== undefined && { staleTime }),
						}),
						call?.signal,
					) as never;
				},
				mutate: mutate as never,
				mutation: (doc) =>
					mutationHandle(riva, (vars, call?: MutateCall) =>
						mutate(doc as never, vars, call),
					) as never,
				subscribe(doc, ...args) {
					const op = operationOf(doc, 'subscription');
					if (!transport.subscribe)
						throw new RivaError(
							'RIVA_DEFINITION',
							'riva-graphql: this transport cannot subscribe: give graphql() a @softistx/graphql-client client, or a transport with a subscribe method.',
						);
					const read = varsReader(riva, args[0] as never);
					const on = (args[1] ?? {}) as SubscribeCall<never>;
					const cache = options.cache;
					const policy =
						cache && 'forOperation' in cache ? cache.forOperation(op) : cache;
					const subscribeTo = transport.subscribe.bind(transport);
					const factoryOf = memoFactory(
						op.id,
						(vars: never) => (signal: AbortSignal) => ({
							[Symbol.asyncIterator]() {
								const it = subscribeTo(op, vars, { signal })[
									Symbol.asyncIterator
								]();
								return {
									async next() {
										try {
											const r = await it.next();
											if (!r.done) policy?.commit?.(riva, r.value, vars);
											return r;
										} catch (e) {
											throw toRivaError(e, signal);
										}
									},
									// Not a generator: return() reaches the transport even while a next() is pending.
									return: async (v?: unknown) =>
										(await it.return?.(v as never)) ?? {
											done: true as const,
											value: undefined,
										},
								};
							},
						}),
					);
					return streamResource(riva, () => factoryOf(read()), {
						...(on.enabled !== undefined && { enabled: on.enabled }),
						...(on.next && { next: on.next }),
						...(on.error && { error: on.error }),
						...(on.complete && { complete: on.complete }),
					}) as never;
				},
			};
		},
	};
}
