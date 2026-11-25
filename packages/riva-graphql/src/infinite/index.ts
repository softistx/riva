import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import {
	infinite as coreInfinite,
	type FeedVars,
	type Infinite,
	type InfiniteOptions,
} from '@softistx/riva/infinite';
import { operationOf } from '../operation';
import { fetchOf } from '../run';

export type GraphQLInfiniteOptions<
	Vars,
	Data,
	Node,
	A extends string = 'after',
	B extends string = 'before',
> = Omit<InfiniteOptions<Vars, Data, Node, A, B>, 'id' | 'fetch'> & {
	/** Replaces the id derived from the document. */
	id?: string;
};

/**
 * A cursor-paginated list from a typed query document: the document's
 * variables carry the cursors (`after`, `before`, or `cursor` names), a page
 * is the document's data and `connection` reads the connection out of it.
 * Its id is the query's id plus `#infinite`, so one document may back both
 * `query()` and `infinite()` without sharing a cache entry.
 */
export function infinite<
	Data,
	Vars,
	Node,
	A extends string = 'after',
	B extends string = 'before',
>(
	document: TypedDocumentNode<Data, Vars>,
	opts: GraphQLInfiniteOptions<Vars, Data, Node, A, B>,
): Infinite<FeedVars<Vars, A | B>, Data, Node> {
	const op = operationOf(document, 'query');
	const { id, ...rest } = opts;
	return coreInfinite<Vars, Data, Node, A, B>({
		...rest,
		id: id ?? `${op.id}#infinite`,
		fetch: fetchOf(op) as InfiniteOptions<Vars, Data, Node, A, B>['fetch'],
	});
}
