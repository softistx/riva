import { useMutationHandle } from '@softistx/riva-react/resource';
import type { MutationMethod } from '../simple';
import { restOf } from './rest-of';
import type { UseRestMutation } from './types';

function useRestMutationImpl(method: MutationMethod, path: string) {
	return useMutationHandle(`${method} ${path}`, (riva) =>
		restOf(riva).mutation(method, path),
	);
}

/**
 * A POST, PUT, PATCH or DELETE held by the component: read `run`, `status`, `data`,
 * `error` and `reset` from the result (`await run({ json })` resolves with the
 * data and rejects with the error, `invalidates` as a second argument; `idle`
 * first; `reset()` goes back to idle). `run` and `reset` keep their identity
 * across renders.
 */
export const useRestMutation =
	useRestMutationImpl as unknown as UseRestMutation;
