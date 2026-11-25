import type {
	Mutation,
	QueryStatus,
	RunOptions,
	VarsArgs,
} from '@softistx/riva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface Settled<Data> {
	status: QueryStatus;
	data: Data | undefined;
	error: unknown;
}

const IDLE: Settled<never> = Object.freeze({
	status: 'idle',
	data: undefined,
	error: undefined,
});

/**
 * Runs a mutation with its own status, data and error, held by this hook
 * instance. A run finishes when its component unmounts; it just stops
 * reporting. When runs overlap, the latest one owns the state.
 */
export function useMutation<Vars, Data>(
	def: Mutation<Vars, Data>,
): MutationResult<Vars, Data> {
	const riva = useRiva();
	const [state, setState] = useState<Settled<Data>>(IDLE);
	const live = useRef(false);
	const latest = useRef(0);
	useEffect(() => {
		live.current = true;
		return () => {
			live.current = false;
		};
	}, []);
	const report = useCallback((id: number, next: Settled<Data>) => {
		if (live.current && id === latest.current) setState(next);
	}, []);
	const run = useCallback(
		async (...args: VarsArgs<Vars, [opts?: RunOptions]>) => {
			const id = ++latest.current;
			report(id, { status: 'pending', data: undefined, error: undefined });
			try {
				const data = await (
					def.run as (c: typeof riva, ...a: unknown[]) => Promise<Data>
				)(riva, ...args);
				report(id, { status: 'success', data, error: undefined });
				return data;
			} catch (error) {
				report(id, { status: 'error', data: undefined, error });
				throw error;
			}
		},
		[riva, def, report],
	);
	const reset = useCallback(() => {
		latest.current++;
		setState(IDLE);
	}, []);
	return useMemo(
		() => ({ ...state, run, reset, isPending: state.status === 'pending' }),
		[state, run, reset],
	);
}
