import type { Riva, RunOptions, VarsArgs } from '@softistx/riva';
import type { MutationHandle, MutationState } from '@softistx/riva/resource';
import {
	useCallback,
	useInsertionEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from 'react';
import { useRiva } from '../context';

/**
 * What every mutation hook returns (`useMutation`, `useGraphQLMutation`,
 * `useRestMutation`): `mutate` and `reset` are stable across renders, `status`,
 * `data` and `error` are the state of the last run (`idle` first).
 */
export type MutationResult<
	Vars,
	Data,
	Opts = RunOptions,
> = MutationState<Data> & {
	/** Runs the mutation: resolves with the server data, rejects with the error (also in `error`). */
	mutate: (...args: VarsArgs<Vars, [opts?: Opts]>) => Promise<Data>;
	/** Back to `idle`; the result of a run still in flight is dropped from the state. */
	reset: () => void;
};

/**
 * A mutation handle held by the component: `make` builds it for the riva in
 * scope (once per riva and `key`; a definition is its own key), `mutate` calls
 * it and the state of its last call is read beside it. `mutate` and `reset` keep
 * their identity across renders. The state starts `idle` on the server and
 * the client alike; a call that outlives the component only stops reporting.
 */
export function useMutationHandle<Vars, Data, Opts = never>(
	key: unknown,
	make: (riva: Riva) => MutationHandle<Vars, Data, Opts>,
): MutationResult<Vars, Data, Opts> {
	const riva = useRiva();
	const handle = useMemo(() => make(riva), [riva, key]);
	const current = useRef(handle);
	// Written before layout effects and never during render (the useEvent pattern).
	useInsertionEffect(() => {
		current.current = handle;
	});
	const state = useSyncExternalStore(
		useCallback((notify: () => void) => handle.subscribe(notify), [handle]),
		() => handle.state,
		() => handle.state,
	);
	const mutate = useCallback(
		(...args: VarsArgs<Vars, [opts?: Opts]>) => current.current(...args),
		[],
	);
	const reset = useCallback(() => current.current.reset(), []);
	return useMemo(() => ({ ...state, mutate, reset }), [state, mutate, reset]);
}
