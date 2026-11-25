import type { Readable, Signal } from '@softistx/riva';
import { useCallback, useSyncExternalStore } from 'react';
import { useRiva } from './context';

/** The value of a signal or computed, re-rendering when it changes. */
export function useValue<T>(def: Readable<T>): T {
	const riva = useRiva();
	const subscribe = useCallback(
		(notify: () => void) => riva.subscribe(def, notify),
		[riva, def],
	);
	const read = () => riva.get(def);
	return useSyncExternalStore(subscribe, read, read);
}

/** A signal's value and its setter (a value or an updater, as the signal's own `set`). */
export function useSignal<T>(
	def: Signal<T>,
): [value: T, set: (value: T | ((prev: T) => T)) => void] {
	const riva = useRiva();
	const value = useValue(def);
	const set = useCallback(
		(next: T | ((prev: T) => T)) => riva.set(def, next),
		[riva, def],
	);
	return [value, set];
}
