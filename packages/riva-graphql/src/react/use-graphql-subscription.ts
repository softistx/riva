import type { VarsArgs } from '@softistx/riva';
import type { ResourceState } from '@softistx/riva/resource';
import { useResource, useStableInput } from '@softistx/riva-react/resource';
import { useRef } from 'react';
import type { Doc } from '../calls';
import { operationOf } from '../operation';
import type { VarsInput } from '../resources';
import type { SubscribeCall } from '../subscription';
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
	...args: VarsArgs<VarsInput<VarsOf<Vars>>, [options?: SubscribeCall<Data>]>
): ResourceState<Data>;
export function useGraphQLSubscription(
	document: Doc<unknown, never>,
	vars?: unknown,
	options: SubscribeCall<unknown> = {},
): ResourceState<unknown> {
	const latest = useRef(options);
	latest.current = options;
	const calls = useRef<SubscribeCall<unknown>>({
		next: (d) => latest.current.next?.(d),
		error: (e) => latest.current.error?.(e),
		complete: () => latest.current.complete?.(),
	}).current;
	const input = useStableInput(
		operationOf(document, 'subscription').id,
		vars,
		options.enabled,
		false,
	);
	return useResource(input.key, (riva) =>
		graphqlOf(riva).subscribe(document, input.input as never, {
			...calls,
			enabled: input.enabled,
		}),
	);
}
