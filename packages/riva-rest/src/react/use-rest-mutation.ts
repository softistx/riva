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
 * A POST, PUT, PATCH or DELETE held by the component: call the returned
 * function with the input (`await save({ json })` resolves with the data and
 * rejects with the error, `invalidates` as a second argument), read `status`,
 * `data` and `error` beside it (`idle` first), and `reset()` goes back to idle.
 */
export const useRestMutation =
	useRestMutationImpl as unknown as UseRestMutation;
