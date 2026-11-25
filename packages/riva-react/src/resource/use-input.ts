import { type Riva, stableKey } from '@softistx/riva';
import { useMemo } from 'react';
import { useRiva } from '../context';

export interface StableInput {
	/** Identifies the resource these arguments make: give it to `useResource`. */
	key: string;
	/** What to hand the call as variables or input, as given (a plain value, a signal, a computed or a function). */
	input: unknown;
	/** What to hand the call as `enabled`, as given (a boolean or a function). */
	enabled: boolean | (() => boolean);
}

const isSignal = (x: unknown): boolean => {
	const kind = (x as { kind?: unknown } | null)?.kind;
	return typeof x === 'object' && (kind === 'signal' || kind === 'computed');
};

/**
 * Turns a hook's variables (or input) and `enabled` into what a resource call
 * takes, with a key that changes exactly when the resource has to change. The
 * key is derived at render from the value: a plain value by its stable
 * serialization, a signal or a function by reading it once, untracked (a
 * function that reads props follows them; a disabled hook never calls it).
 * The resource itself still tracks the signals the function reads. What is
 * handed to the resource is the value of the render that last changed the key,
 * so nothing is written to a ref during render.
 */
export function useStableInput(
	id: string,
	input: unknown,
	enabled: boolean | (() => boolean) | undefined,
): StableInput {
	const riva: Riva = useRiva();
	const tracked = typeof enabled === 'function';
	const on = tracked ? riva.untracked(enabled) : enabled !== false;
	// A variables function is only called while enabled; a plain value or a
	// signal can be keyed either way, so a tracked `enabled` flip keeps the
	// resource (no remount, no second fetch).
	const keyed = on || typeof input !== 'function';
	const key = `${
		keyed
			? stableKey(
					id,
					riva.untracked(() =>
						typeof input === 'function'
							? (input as () => unknown)()
							: isSignal(input)
								? riva.get(input as never)
								: input,
					),
				)
			: id
	}|${tracked ? 'fn' : on ? 'on' : 'off'}${keyed ? '' : '|idle'}`;
	const held = useMemo(
		() => ({ input, enabled: enabled === undefined ? true : enabled }),
		[key],
	);
	return { key, input: held.input, enabled: held.enabled };
}
