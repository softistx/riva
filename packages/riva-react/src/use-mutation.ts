import type { Mutation, RunOptions } from '@softistx/riva';
import { mutationHandle } from '@softistx/riva/resource';
import {
	type MutationResult,
	useMutationHandle,
} from './resource/use-mutation-handle';

export type { MutationResult };

/**
 * Runs a mutation with its own status, data and error, held by this hook
 * instance. A run finishes when its component unmounts; it just stops
 * reporting. When runs overlap, the latest one owns the state.
 */
export function useMutation<Vars, Data>(
	def: Mutation<Vars, Data>,
): MutationResult<Vars, Data> {
	return useMutationHandle(def, (riva) =>
		mutationHandle<Vars, Data, RunOptions>(riva, (vars, opts) =>
			(def.run as (c: typeof riva, ...a: unknown[]) => Promise<Data>)(
				riva,
				vars,
				opts,
			),
		),
	);
}
