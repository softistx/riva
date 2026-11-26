import {
	type MutationResult,
	useMutationHandle,
} from '@softistx/riva-react/resource';
import type { Doc, GraphQLMutateCall } from '../calls';
import { operationOf } from '../operation';
import type { VarsOf } from '../types';
import { graphqlOf } from './graphql-of';

/**
 * A GraphQL mutation held by the component: read `run`, `status`, `data`,
 * `error` and `reset` from the result (`await run({ id })` resolves with the
 * data and rejects with the error; `idle` first; `reset()` goes back to idle).
 * `run` and `reset` keep their identity across renders. Its options are `riva.graphql.mutation`'s
 * (`invalidates`).
 */
export function useGraphQLMutation<Data, Vars>(
	document: Doc<Data, Vars>,
): MutationResult<VarsOf<Vars>, Data, GraphQLMutateCall> {
	return useMutationHandle(operationOf(document).id, (riva) =>
		graphqlOf(riva).mutation(document),
	);
}
