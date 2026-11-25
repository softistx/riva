import { computed } from '@softistx/riva';
import { readEntity } from '@softistx/riva/entities';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useClient } from '../context';

/**
 * An entity of the normalized cache by its ref (`Type:id`), re-rendering when
 * its fields change and only then. `undefined` while the entity is missing or
 * the ref is empty.
 */
export function useFragment<T = Record<string, unknown>>(
	ref: string | null | undefined,
): T | undefined {
	const client = useClient();
	const def = useMemo(
		() => computed(() => (ref ? readEntity<T>(client, ref) : undefined)),
		[client, ref],
	);
	const subscribe = useCallback(
		(notify: () => void) => client.subscribe(def, notify),
		[client, def],
	);
	const read = () => client.get(def);
	return useSyncExternalStore(subscribe, read, read);
}
