import type { ResourceState } from '@softistx/riva/resource';
import { useCallResource } from '@softistx/riva-react/resource';
import type { GetCall } from '../calls';
import { restOf } from './rest-of';
import type { UseRest, UseRestOptions } from './types';

function useRestImpl(
	method: 'get',
	path: string,
	input?: unknown,
	options: UseRestOptions = {},
): ResourceState<unknown> {
	return useCallResource(
		`${method} ${path}`,
		input,
		options,
		(riva, stable, call) => restOf(riva).get(path, stable, call as GetCall),
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
