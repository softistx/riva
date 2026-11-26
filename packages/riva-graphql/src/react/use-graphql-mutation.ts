import {
	type MutationHook,
	useMutationHandle,
} from '@softistx/riva-react/resource';
import type { Doc, GraphQLMutateCall } from '../calls';
import { operationOf } from '../operation';
import type { VarsOf } from '../types';
import { graphqlOf } from './graphql-of';

/**
 * A GraphQL mutation held by the component: call the returned function with
 * the variables (`await save({ id })` resolves with the data and rejects with
 * the error), read `status`, `data` and `error` beside it (`idle` first), and
 * `reset()` goes back to idle. Its options are `riva.graphql.mutation`'s
 * (`invalidates`).
 */
export function useGraphQLMutation<Data, Vars>(
	document: Doc<Data, Vars>,
): MutationHook<VarsOf<Vars>, Data, GraphQLMutateCall> {
	return useMutationHandle(operationOf(document).id, (riva) =>
		graphqlOf(riva).mutation(document),
	);
}
