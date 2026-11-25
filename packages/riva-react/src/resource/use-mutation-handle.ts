import type { Riva, VarsArgs } from '@softistx/riva';
import type { MutationHandle, MutationState } from '@softistx/riva/resource';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useRiva } from '../context';

/** What a mutation hook returns: call it to run, read the state beside it, `reset()` goes back to idle. */
export type MutationHook<Vars, Data, Opts = never> = ((
	...args: VarsArgs<Vars, [opts?: Opts]>
) => Promise<Data>) &
	MutationState<Data> & { reset(): void };

/**
 * A mutation handle held by the component: `make` builds it for the riva in
 * scope (once per riva and `key`), the returned function runs it and the
 * state of its last call is read beside it. The state starts `idle` on the
 * server and the client alike; a call that outlives the component only stops
 * reporting.
 */
export function useMutationHandle<Vars, Data, Opts = never>(
	key: string,
	make: (riva: Riva) => MutationHandle<Vars, Data, Opts>,
): MutationHook<Vars, Data, Opts> {
	const riva = useRiva();
	const handle = useMemo(() => make(riva), [riva, key]);
	const state = useSyncExternalStore(
		useCallback((notify: () => void) => handle.subscribe(notify), [handle]),
		() => handle.state,
		() => handle.state,
	);
	return useMemo(
		() =>
			Object.assign(
				(...args: VarsArgs<Vars, [opts?: Opts]>) => handle(...args),
				state,
				{ reset: () => handle.reset() },
			) as MutationHook<Vars, Data, Opts>,
		[handle, state],
	);
}
