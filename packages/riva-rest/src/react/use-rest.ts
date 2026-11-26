import { type Query, RivaError } from '@softistx/riva';
import type { ResourceState } from '@softistx/riva/resource';
import { useCallResource } from '@softistx/riva-react/resource';
import type { RestQueryCall } from '../calls';
import { restOf } from './rest-of';
import type { UseRest, UseRestOptions } from './types';

function useRestImpl(
	target: string | Query<unknown, unknown>,
	...rest: unknown[]
): ResourceState<unknown> {
	if (target === 'get' && typeof rest[0] === 'string')
		throw new RivaError(
			'RIVA_DEFINITION',
			`riva-rest/react: useRest('get', path) is gone: call useRest(path), here useRest(${JSON.stringify(rest[0])}).`,
		);
	if (
		typeof target !== 'string' &&
		(target as { kind?: unknown } | null)?.kind !== 'query'
	)
		throw new RivaError(
			'RIVA_DEFINITION',
			'riva-rest/react: useRest takes a path or a query definition.',
		);
	const [input, options = {}] = rest as [unknown, UseRestOptions?];
	return useCallResource(
		typeof target === 'string' ? `get ${target}` : `def:${target.id}`,
		input,
		options,
		(riva, stable, call) =>
			restOf(riva).get(target as never, stable, call as RestQueryCall),
	);
}

/**
 * A GET's state for this input, fetched while the component is mounted. The
 * input is httpyz's `{ param, query, json }`: a plain value (a change
 * refetches and keeps the previous data as `placeholder`), a riva signal or
 * computed, or a function that reads signals. While `enabled` is false the
 * state is `idle`, the input function is not called and nothing is fetched.
 * Typed by your spec once `Register` names it.
 */
export const useRest = useRestImpl as unknown as UseRest;
