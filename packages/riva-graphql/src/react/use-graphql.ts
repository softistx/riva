import type { Query, VarsArgs } from '@softistx/riva';
import type { ResourceState, TrackedInput } from '@softistx/riva/resource';
import {
	type SuspendedState,
	useCallResource,
} from '@softistx/riva-react/resource';
import type { Doc, GraphQLQueryCall } from '../calls';
import { operationOf } from '../operation';
import type { TargetData, TargetVars } from '../types';
import { graphqlOf } from './graphql-of';

export interface UseGraphQLOptions extends Omit<GraphQLQueryCall, 'signal'> {
	/** Suspends until there is data, and throws an error to the nearest error boundary (a response with data and errors included). The state is then `success`. Default false. */
	suspense?: boolean;
}

// biome-ignore lint/suspicious/noConfusingVoidType: no variables is `void`
type Void = void | undefined;
/** `enabled` is not available with `suspense`: a hook that suspends has data or throws, it is never idle. */
type Suspending<O> = Omit<O, 'enabled'> & { suspense: true; enabled?: never };
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
// biome-ignore lint/suspicious/noExplicitAny: matches any document or definition
export function useGraphQL<T extends Doc<any, any> | Query<any, any>>(
	target: T,
	...args: SuspenseArgs<
		TrackedInput<TargetVars<T>>,
		Suspending<UseGraphQLOptions>
	>
): SuspendedState<TargetData<T>>;
// biome-ignore lint/suspicious/noExplicitAny: matches any document or definition
export function useGraphQL<T extends Doc<any, any> | Query<any, any>>(
	target: T,
	...args: VarsArgs<
		TrackedInput<TargetVars<T>>,
		[options?: UseGraphQLOptions & { suspense?: false }]
	>
): ResourceState<TargetData<T>>;
export function useGraphQL(
	document: Doc<unknown, never> | Query<unknown, unknown>,
	vars?: unknown,
	options: UseGraphQLOptions = {},
): ResourceState<unknown> {
	return useCallResource(
		(document as { kind?: unknown }).kind === 'query'
			? `def:${(document as Query<unknown, unknown>).id}`
			: operationOf(document as Doc<unknown, never>).id,
		vars,
		options,
		(riva, input, call) =>
			graphqlOf(riva).query(
				document as never,
				input as never,
				call as GraphQLQueryCall,
			) as never,
	);
}
