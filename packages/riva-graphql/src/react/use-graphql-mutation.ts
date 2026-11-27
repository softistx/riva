import {
	type MutationResult,
	useMutationHandle,
} from '@softistx/riva-react/resource';
import type { Doc, GraphQLMutateCall } from '../calls';
import { operationOf } from '../operation';
import type { VarsOf } from '../types';
import { graphqlOf } from './graphql-of';

/**
 * A GraphQL mutation held by the component: read `mutate`, `status`, `data`,
 * `error` and `reset` from the result (`await mutate({ id })` resolves with the
 * data and rejects with the error; `idle` first; `reset()` goes back to idle).
 * `mutate` and `reset` keep their identity across renders. Its options are `riva.graphql.mutation`'s
 * (`invalidates`).
 */
export function useGraphQLMutation<Data, Vars>(
	document: Doc<Data, Vars>,
): MutationResult<VarsOf<Vars>, Data, GraphQLMutateCall> {
	return useMutationHandle(operationOf(document).id, (riva) =>
		graphqlOf(riva).mutation(document),
	);
}
