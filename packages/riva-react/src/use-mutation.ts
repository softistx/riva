import type {
	Mutation,
	QueryStatus,
	RunOptions,
	VarsArgs,
} from '@softistx/riva';
import { mutationHandle } from '@softistx/riva/resource';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useRiva } from './context';

export interface MutationResult<Vars, Data> {
	/** Runs the mutation: resolves with the server data, rejects with the error (also in `error`). */
	run: (...args: VarsArgs<Vars, [opts?: RunOptions]>) => Promise<Data>;
	status: QueryStatus;
	data: Data | undefined;
	error: unknown;
	isPending: boolean;
	/** Back to `idle`; the result of a run still in flight is dropped from the state. */
	reset: () => void;
}

/**
 * Runs a mutation with its own status, data and error, held by this hook
 * instance. A run finishes when its component unmounts; it just stops
 * reporting. When runs overlap, the latest one owns the state.
 */
export function useMutation<Vars, Data>(
	def: Mutation<Vars, Data>,
): MutationResult<Vars, Data> {
	const riva = useRiva();
	const handle = useMemo(
		() =>
			mutationHandle<Vars, Data, RunOptions>(riva, (vars, opts) =>
				(def.run as (c: typeof riva, ...a: unknown[]) => Promise<Data>)(
					riva,
					vars,
					opts,
				),
			),
		[riva, def],
	);
	const state = useSyncExternalStore(
		useCallback((notify: () => void) => handle.subscribe(notify), [handle]),
		() => handle.state,
		() => handle.state,
	);
	const run = useCallback(
		(...args: VarsArgs<Vars, [opts?: RunOptions]>) => handle(...args),
		[handle],
	);
	const reset = useCallback(() => handle.reset(), [handle]);
	return useMemo(
		() => ({ ...state, run, reset, isPending: state.status === 'loading' }),
		[state, run, reset],
	);
}
