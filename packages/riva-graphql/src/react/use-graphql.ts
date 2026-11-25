import type { VarsArgs } from '@softistx/riva';
import type { ResourceState } from '@softistx/riva/resource';
import {
	type SuspendedState,
	suspenseStaleTime,
	useResource,
	useStableInput,
} from '@softistx/riva-react/resource';
import type { Doc, QueryCall } from '../calls';
import { operationOf } from '../operation';
import type { VarsInput } from '../resources';
import type { VarsOf } from '../types';
import { graphqlOf } from './graphql-of';

/** How long (ms) a mount trusts what a Suspense render just fetched. */

export interface UseGraphQLOptions extends Omit<QueryCall, 'signal'> {
	/** Suspends until there is data, and throws an error to the nearest error boundary (a response with data and errors included). The state is then `success`. Default false. */
	suspense?: boolean;
}

// biome-ignore lint/suspicious/noConfusingVoidType: no variables is `void`
type Void = void | undefined;
type SuspenseArgs<V, O> = [V] extends [Void]
	? [vars: V | undefined, options: O]
	: [vars: V, options: O];

/**
 * A GraphQL query's state for these variables, fetched while the component is
 * mounted. The variables are a plain value (a change refetches and keeps the
 * previous data as `placeholder`), a riva signal or computed, or a function
 * that reads signals. While `enabled` is false the state is `idle`, the
 * variables function is not called and nothing is fetched. A response with
 * data and errors is the `error` state with the partial `data`.
 */
export function useGraphQL<Data, Vars>(
	document: Doc<Data, Vars>,
	...args: SuspenseArgs<
		VarsInput<VarsOf<Vars>>,
		UseGraphQLOptions & { suspense: true }
	>
): SuspendedState<Data>;
export function useGraphQL<Data, Vars>(
	document: Doc<Data, Vars>,
	...args: VarsArgs<VarsInput<VarsOf<Vars>>, [options?: UseGraphQLOptions]>
): ResourceState<Data>;
export function useGraphQL(
	document: Doc<unknown, never>,
	vars?: unknown,
	options: UseGraphQLOptions = {},
): ResourceState<unknown> {
	const { suspense = false, keepPrevious, staleTime, enabled } = options;
	const input = useStableInput(operationOf(document).id, vars, enabled);
	return useResource(
		input.key,
		(riva) =>
			graphqlOf(riva).query(
				document,
				input.input as never,
				{
					enabled: input.enabled,
					...(keepPrevious === undefined ? {} : { keepPrevious }),
					...(suspense
						? { staleTime: suspenseStaleTime(riva, staleTime) }
						: staleTime === undefined
							? {}
							: { staleTime }),
				} as QueryCall,
			) as never,
		{ suspense, ...(keepPrevious === undefined ? {} : { keepPrevious }) },
	) as ResourceState<unknown>;
}
