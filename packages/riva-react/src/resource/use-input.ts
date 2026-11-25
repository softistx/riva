import { type Riva, stableKey } from '@softistx/riva';
import { useRef } from 'react';
import { useRiva } from '../context';

export interface StableInput {
	/** Identifies the resource these arguments make: give it to `useResource`. */
	key: string;
	/** What to hand the call as variables or input: a plain value, a signal or computed as given, or a stable function over the latest one. */
	input: unknown;
	/** What to hand the call as `enabled`: a boolean, or a stable function over the latest one. */
	enabled: boolean | (() => boolean);
}

const isSignal = (x: unknown): boolean => {
	const kind = (x as { kind?: unknown } | null)?.kind;
	return typeof x === 'object' && (kind === 'signal' || kind === 'computed');
};

/**
 * Turns a hook's variables (or input) and `enabled` into what a resource call
 * takes, with a key that changes exactly when the resource has to change. A
 * plain value is keyed by its stable serialization, so an inline `{ id }`
 * never rebuilds the resource and a different one does. A function or a
 * signal is tracked by the resource itself, so the function is read through a
 * stable wrapper over the latest render's one. With `suspense` the key needs
 * the value: it is read once, untracked, and only while enabled.
 */
export function useStableInput(
	id: string,
	input: unknown,
	enabled: boolean | (() => boolean) | undefined,
	suspense: boolean,
): StableInput {
	const riva: Riva = useRiva();
	const inputRef = useRef(input);
	inputRef.current = input;
	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;
	const wrapped = useRef({
		input: () => (inputRef.current as () => unknown)(),
		enabled: () => (enabledRef.current as () => boolean)(),
	}).current;
	const sig = useRef<{ of: unknown; n: number }>({ of: undefined, n: 0 });
	const dynamic = typeof input === 'function';
	const signalled = !dynamic && isSignal(input);
	if (signalled && sig.current.of !== input)
		sig.current = { of: input, n: sig.current.n + 1 };
	const live = typeof enabled === 'function';
	const on = (): boolean =>
		live ? riva.untracked(enabled as () => boolean) : enabled !== false;
	let part: string;
	if (suspense) {
		part = on()
			? stableKey(
					id,
					riva.untracked(() =>
						dynamic
							? (input as () => unknown)()
							: signalled
								? riva.get(input as never)
								: input,
					),
				)
			: `${id}|off`;
	} else if (dynamic) part = `${id}|fn`;
	else if (signalled) part = `${id}|sig${sig.current.n}`;
	else part = stableKey(id, input);
	return {
		key: `${part}|${live ? 'live' : enabled !== false}`,
		input: dynamic ? wrapped.input : input,
		enabled: live ? wrapped.enabled : enabled !== false,
	};
}
