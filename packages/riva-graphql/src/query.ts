import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import {
	mutation as coreMutation,
	query as coreQuery,
	type Mutation,
	type MutationOptions,
	type Query,
	type QueryOptions,
} from '@softistx/riva';
import { operationOf } from './operation';
import { fetchOf } from './run';
import type { VarsOf } from './types';

/** The core's query options, minus what the document gives. */
export type GraphQLQueryOptions = Omit<
	QueryOptions<unknown, unknown>,
	'id' | 'fetch' | 'derive'
> & {
	/** Replaces the id derived from the document (to define one document twice with different options). */
	id?: string;
};

export type GraphQLMutationOptions<Vars, Data> = Omit<
	MutationOptions<Vars, Data>,
	'id' | 'run'
> & {
	/** Replaces the id derived from the document. */
	id?: string;
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
	const { id, ...rest } = opts;
	return coreQuery<VarsOf<Vars>, Data>({
		...rest,
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
	const { id, ...rest } = opts;
	return coreMutation<VarsOf<Vars>, Data>({
		...rest,
		id: id ?? op.id,
		run: fetchOf(op) as MutationOptions<VarsOf<Vars>, Data>['run'],
	});
}
