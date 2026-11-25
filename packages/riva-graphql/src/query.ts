import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import {
	type CachePolicy,
	mutation as coreMutation,
	query as coreQuery,
	type Mutation,
	type MutationOptions,
	type Query,
	type QueryOptions,
} from '@softistx/riva';
import type { DocumentNode } from 'graphql';
import { type Operation, operationOf } from './operation';
import { fetchOf } from './run';
import type { VarsOf } from './types';

/** What a cache binds to: the operation a definition was made from. */
export type BoundOperation = Pick<Operation, 'kind' | 'name' | 'id'> & {
	readonly document: DocumentNode;
};

/**
 * A cache that needs the document to read and write its data, such as
 * `normalized()` from `@softistx/riva-graphql/cache`: the definition binds it
 * to its operation.
 */
export interface OperationCache {
	forOperation(operation: BoundOperation): CachePolicy;
}

/** The policy of a `cache` option: a core policy as is, an operation cache bound to `op`. */
const policyOf = (
	cache: CachePolicy | OperationCache | undefined,
	op: BoundOperation,
): { cache?: CachePolicy } => {
	const policy =
		cache && 'forOperation' in cache ? cache.forOperation(op) : cache;
	return policy ? { cache: policy } : {};
};

/** The core's query options, minus what the document gives. */
export type GraphQLQueryOptions = Omit<
	QueryOptions<unknown, unknown>,
	'id' | 'fetch' | 'derive' | 'cache'
> & {
	/** Replaces the id derived from the document (to define one document twice with different options). */
	id?: string;
	/** How the data is stored: a core policy, or `normalized()` from `@softistx/riva-graphql/cache`. */
	cache?: CachePolicy | OperationCache;
};

export type GraphQLMutationOptions<Vars, Data> = Omit<
	MutationOptions<Vars, Data>,
	'id' | 'run' | 'cache'
> & {
	/** Replaces the id derived from the document. */
	id?: string;
	/** Where the result and the optimistic data go: a core policy, or `normalized()`. */
	cache?: CachePolicy | OperationCache;
};

/**
 * A query definition from a typed document: variables and data are the
 * document's, never annotated. Its id is the document's persisted id, else
 * its operation name. Throws a `TypeError` for a document that is not exactly
 * one named query.
 */
export function query<Data, Vars>(
	document: TypedDocumentNode<Data, Vars>,
	opts: GraphQLQueryOptions = {},
): Query<VarsOf<Vars>, Data> {
	const op = operationOf(document, 'query');
	const { id, cache, ...rest } = opts;
	return coreQuery<VarsOf<Vars>, Data>({
		...rest,
		...policyOf(cache, op),
		id: id ?? op.id,
		fetch: fetchOf(op) as QueryOptions<VarsOf<Vars>, Data>['fetch'],
	});
}

/** A mutation definition from a typed document; the id is derived as for `query`. */
export function mutation<Data, Vars>(
	document: TypedDocumentNode<Data, Vars>,
	opts: GraphQLMutationOptions<VarsOf<Vars>, Data> = {},
): Mutation<VarsOf<Vars>, Data> {
	const op = operationOf(document, 'mutation');
	const { id, cache, ...rest } = opts;
	return coreMutation<VarsOf<Vars>, Data>({
		...rest,
		...policyOf(cache, op),
		id: id ?? op.id,
		run: fetchOf(op) as MutationOptions<VarsOf<Vars>, Data>['run'],
	});
}
