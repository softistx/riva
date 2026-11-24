import type { Atom, Readable } from '@softistx/riva';
import { useCallback, useSyncExternalStore } from 'react';
import { useClient } from './context';

/** The value of an atom or computed, re-rendering when it changes. */
export function useValue<T>(def: Readable<T>): T {
	const client = useClient();
	const subscribe = useCallback(
		(notify: () => void) => client.subscribe(def, notify),
		[client, def],
	);
	const read = () => client.get(def);
	return useSyncExternalStore(subscribe, read, read);
}

/** An atom's value and its setter (a value or an updater, as the atom's own `set`). */
export function useAtom<T>(
	def: Atom<T>,
): [value: T, set: (value: T | ((prev: T) => T)) => void] {
	const client = useClient();
	const value = useValue(def);
	const set = useCallback(
		(next: T | ((prev: T) => T)) => client.set(def, next),
		[client, def],
	);
	return [value, set];
}
