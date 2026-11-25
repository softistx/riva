import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type {
	CachePolicy,
	Duration,
	Invalidation,
	Mutation,
	Query,
	Riva,
} from '@softistx/riva';
import { mutationHandle, resource } from '@softistx/riva/resource';
import { operationOf } from './operation';
import { mutation, type OperationCache, query } from './query';
import { graphqlResource, varsReader } from './resources';

export type Doc<Data, Vars> = TypedDocumentNode<Data, Vars>;

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

// Per riva, on its slots: the definitions its ad-hoc calls memoise by document.
const MEMO = {};

interface Memo {
	queries: Map<object, Query<never, unknown>>;
	mutations: Map<object, Mutation<never, unknown>>;
}

/** The query, mutate and mutation calls of one riva, over the definitions it memoises per document. */
export function callsOf(
	riva: Riva,
	cache: CachePolicy | OperationCache | undefined,
) {
	const defaults = cache ? { cache } : {};
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
		mutate,
		query(doc: Doc<unknown, never>, vars?: unknown, call?: QueryCall) {
			const def = queryOf(doc);
			const read = varsReader(riva, vars);
			const { enabled, keepPrevious, staleTime } = call ?? {};
			return graphqlResource(
				resource(riva, () => [def, read()] as never, {
					...(enabled !== undefined && { enabled }),
					...(keepPrevious !== undefined && { keepPrevious }),
					...(staleTime !== undefined && { staleTime }),
				}),
				call?.signal,
			);
		},
		mutation: (doc: Doc<unknown, never>) =>
			mutationHandle(riva, (vars: unknown, call?: MutateCall) =>
				mutate(doc, vars, call),
			),
	};
}
