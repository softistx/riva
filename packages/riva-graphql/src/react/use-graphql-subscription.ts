import type { VarsArgs } from '@softistx/riva';
import type { ResourceState, TrackedInput } from '@softistx/riva/resource';
import { useResource, useStableInput } from '@softistx/riva-react/resource';
import { useEffect, useRef } from 'react';
import type { Doc } from '../calls';
import { operationOf } from '../operation';
import type { GraphQLSubscribeCall } from '../subscription';
import type { VarsOf } from '../types';
import { graphqlOf } from './graphql-of';

/**
 * A GraphQL subscription's state: `loading` until the first result, then
 * `success` with the last one, or `error` (the last result kept). The stream
 * opens at mount and closes at unmount; variables that change restart it.
 * The callbacks (`next`, `error`, `complete`) always call the latest ones of
 * the render.
 */
export function useGraphQLSubscription<Data, Vars>(
	document: Doc<Data, Vars>,
	...args: VarsArgs<
		TrackedInput<VarsOf<Vars>>,
		[options?: GraphQLSubscribeCall<Data>]
	>
): ResourceState<Data>;
export function useGraphQLSubscription(
	document: Doc<unknown, never>,
	vars?: unknown,
	options: GraphQLSubscribeCall<unknown> = {},
): ResourceState<unknown> {
	const latest = useRef(options);
	useEffect(() => {
		latest.current = options;
	});
	const calls = useRef<GraphQLSubscribeCall<unknown>>({
		next: (d) => latest.current.next?.(d),
		error: (e) => latest.current.error?.(e),
		complete: () => latest.current.complete?.(),
	}).current;
	const input = useStableInput(
		operationOf(document, 'subscription').id,
		vars,
		options.enabled,
	);
	return useResource(input.key, (riva) =>
		graphqlOf(riva).subscribe(document, input.input as never, {
			...calls,
			enabled: input.enabled,
		}),
	);
}
