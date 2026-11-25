import { computed } from '@softistx/riva';
import { readEntity } from '@softistx/riva/entities';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useRiva } from '../context';

/**
 * An entity of the normalized cache by its ref (`Type:id`), re-rendering when
 * its fields change and only then. `undefined` while the entity is missing or
 * the ref is empty.
 */
export function useFragment<T = Record<string, unknown>>(
	ref: string | null | undefined,
): T | undefined {
	const riva = useRiva();
	const def = useMemo(
		() => computed(() => (ref ? readEntity<T>(riva, ref) : undefined)),
		[riva, ref],
	);
	const subscribe = useCallback(
		(notify: () => void) => riva.subscribe(def, notify),
		[riva, def],
	);
	const read = () => riva.get(def);
	return useSyncExternalStore(subscribe, read, read);
}
