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
import { graphqlClientTransport } from './client-transport';
import { toRivaError } from './errors';
import { operationOf } from './operation';
import { mutation, type OperationCache, query } from './query';
import { type GraphQLTransport, provideGraphQL } from './transport';
import type { VarsOf } from './types';

type Doc<Data, Vars> = TypedDocumentNode<Data, Vars>;

/** Options of one `riva.graphql.query` call. */
export interface QueryCall {
	/** Replaces the riva's default `staleTime` for this call: data younger than it is returned without fetching. */
	staleTime?: Duration;
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

/** The callbacks of `riva.graphql.subscribe`. An error thrown by `next`, `error` or `complete` is raised outside the stream (never reported to `error`), and a throwing `next` ends the subscription. */
export interface SubscribeCall<Data> {
	/** Each result, after it was merged into the cache when the cache can hold it. */
	next(data: Data): void;
	/** A failure ends the subscription; a `RivaError` when the transport's error is known. */
	error?(error: unknown): void;
	/** The stream ended on its own (not after `stop()` nor a failure). */
	complete?(): void;
}

/** What `createRiva({ graphql: graphql(client) })` puts on `riva.graphql`. */
export interface GraphQLApi {
	/** Fetches (or reads the fresh cache of) a query; the key is its operation name plus the variables. */
	query<Data, Vars>(
		document: Doc<Data, Vars>,
		...args: VarsArgs<VarsOf<Vars>, [options?: QueryCall]>
	): Promise<Data>;
	/** Runs a mutation and resolves with its data; throws after the rollback. */
	mutate<Data, Vars>(
		document: Doc<Data, Vars>,
		...args: VarsArgs<VarsOf<Vars>, [options?: MutateCall]>
	): Promise<Data>;
	/** Opens a subscription; the returned function stops it. A subscription is not tied to the riva's lifetime: stop it yourself (on unmount, at the end of a request). Throws when the transport cannot subscribe. */
	subscribe<Data, Vars>(
		document: Doc<Data, Vars>,
		...args: [...VarsArgs<VarsOf<Vars>>, callbacks: SubscribeCall<Data>]
	): () => void;
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
			return {
				query: (doc, vars?, call?) =>
					queryOf(doc as never).ensure(riva, vars, call as never) as never,
				async mutate(doc, vars?, call?: MutateCall) {
					const def = mutationOf(doc as never);
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
				},
				subscribe(doc, ...args) {
					const op = operationOf(doc, 'subscription');
					if (!transport.subscribe)
						throw new RivaError(
							'RIVA_DEFINITION',
							'riva-graphql: this transport cannot subscribe: give graphql() a @softistx/graphql-client client, or a transport with a subscribe method.',
						);
					const on = args.pop() as SubscribeCall<never>;
					const vars = args[0] as never;
					const cache = options.cache;
					const policy =
						cache && 'forOperation' in cache ? cache.forOperation(op) : cache;
					const ctl = new AbortController();
					const { signal } = ctl;
					const it = transport
						.subscribe(op, vars, { signal })
						[Symbol.asyncIterator]();
					const end = () => {
						ctl.abort();
						void Promise.resolve(it.return?.()).catch(() => {});
					};
					// What a callback throws is the app's: raised outside the stream.
					const rethrow = (e: unknown) =>
						queueMicrotask(() => {
							throw e;
						});
					void (async () => {
						for (;;) {
							let r: IteratorResult<unknown>;
							try {
								r = await it.next();
							} catch (e) {
								if (!signal.aborted) on.error?.(toRivaError(e, signal));
								return;
							}
							if (signal.aborted) return;
							if (r.done) return on.complete?.();
							try {
								policy?.commit?.(riva, r.value, vars);
								on.next(r.value as never);
							} catch (e) {
								end();
								return rethrow(e);
							}
						}
					})().catch(rethrow);
					return end;
				},
			};
		},
	};
}
