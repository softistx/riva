import type { Riva } from '../client';
import type { VarsArgs } from '../query';
import { type Listener, signal, type Unsubscribe } from '../signal';
import type { MutationState } from './types';

const IDLE: MutationState<never> = Object.freeze({
	status: 'idle',
	data: undefined,
	error: undefined,
});

/** A callable mutation with a reactive state. */
export interface MutationHandle<Vars, Data, Opts = never> {
	/** Runs the mutation; resolves with its data and rejects with its error. */
	(...args: VarsArgs<Vars, [opts?: Opts]>): Promise<Data>;
	/** `idle` first, then `loading`, `success` or `error` for the last call. Tracked when read in a computed. */
	readonly state: MutationState<Data>;
	subscribe(listener: Listener<MutationState<Data>>): Unsubscribe;
	/** Back to `idle`; the outcome of a call still running is ignored by the state. */
	reset(): void;
}

/**
 * Wraps `run` in a callable handle. Calls may overlap: each resolves with its
 * own result, and the state follows the last call made (an earlier call that
 * settles later does not overwrite it).
 */
export function mutationHandle<Vars, Data, Opts = never>(
	riva: Riva,
	run: (vars: Vars, opts?: Opts) => Promise<Data>,
): MutationHandle<Vars, Data, Opts> {
	const state = signal<MutationState<Data>>(IDLE);
	let last = 0;
	const set = (id: number, next: MutationState<Data>) => {
		if (id === last) riva.set(state, next);
	};
	const call = async (vars?: Vars, opts?: Opts): Promise<Data> => {
		const id = ++last;
		set(id, { status: 'loading', data: undefined, error: undefined });
		try {
			const data = await run(vars as Vars, opts);
			set(id, { status: 'success', data, error: undefined });
			return data;
		} catch (error) {
			set(id, { status: 'error', data: undefined, error });
			throw error;
		}
	};
	return Object.defineProperties(call, {
		state: { get: () => riva.get(state) },
		subscribe: {
			value: (l: Listener<MutationState<Data>>) => riva.subscribe(state, l),
		},
		reset: {
			value: () => {
				last++;
				riva.set(state, IDLE);
			},
		},
	}) as never;
}
