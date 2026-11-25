import type { Riva } from '../client';
import type { Computed } from '../computed';
import type { Signal } from '../signal';

/**
 * What an adapter call takes as variables or input: a plain value, a riva
 * signal or computed, or a function that reads signals (tracked: when what it
 * reads changes, the resource follows).
 */
export type TrackedInput<T> = T | Signal<T> | Computed<T> | (() => T);

/** Whether `x` is a riva signal or computed. */
export function isReactive(
	x: unknown,
): x is Signal<unknown> | Computed<unknown> {
	const kind = (x as { kind?: unknown } | null)?.kind;
	return typeof x === 'object' && (kind === 'signal' || kind === 'computed');
}

/** Resolves a `TrackedInput`; called inside a resource's tracked source. */
export function trackedInput<T>(riva: Riva, input: TrackedInput<T>): () => T {
	if (typeof input === 'function') return input as () => T;
	if (isReactive(input)) return () => riva.get(input as Signal<T>);
	return () => input as T;
}
