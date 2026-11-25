import type { ResourceState } from '@softistx/riva/resource';
import { useResource, useStableInput } from '@softistx/riva-react/resource';
import type { GetCall } from '../calls';
import { restOf } from './rest-of';
import type { UseRest, UseRestOptions } from './types';

/** How long (ms) a mount trusts what a Suspense render just fetched. */
const SUSPENSE_FRESH = 1000;

function useRestImpl(
	method: 'get',
	path: string,
	input?: unknown,
	options: UseRestOptions = {},
): ResourceState<unknown> {
	const { suspense = false, keepPrevious, staleTime, enabled } = options;
	const stable = useStableInput(`${method} ${path}`, input, enabled, suspense);
	return useResource(
		stable.key,
		(riva) =>
			restOf(riva).get(path, stable.input, {
				enabled: stable.enabled,
				...(keepPrevious === undefined ? {} : { keepPrevious }),
				...(staleTime === undefined && !suspense
					? {}
					: { staleTime: staleTime ?? SUSPENSE_FRESH }),
			} as GetCall),
		{ suspense, ...(keepPrevious === undefined ? {} : { keepPrevious }) },
	) as ResourceState<unknown>;
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
