import type { Invalidation, RivaClient } from '@softistx/riva';
import { useEffect, useRef } from 'react';
import { useFetchers, useNavigation } from 'react-router';

const isWrite = (method: string | undefined) =>
	method !== undefined && method.toUpperCase() !== 'GET';

/**
 * Invalidates `list` each time a write settles: a navigation that submitted a
 * form (non-GET) or a fetcher that did, once it is idle again, loaders
 * included.
 */
export function useInvalidateOnAction(
	client: RivaClient,
	list: readonly Invalidation[] | undefined,
): void {
	const navigation = useNavigation();
	const fetchers = useFetchers();
	const running = useRef(new Set<string>());
	const now = new Set<string>();
	if (navigation.state !== 'idle' && isWrite(navigation.formMethod))
		now.add('');
	for (const f of fetchers)
		if (f.state !== 'idle' && isWrite(f.formMethod)) now.add(`~${f.key}`);
	useEffect(() => {
		const settled = [...running.current].some((k) => !now.has(k));
		running.current = now;
		if (!settled || !list?.length) return;
		client.batch(() => {
			for (const t of list)
				if ('query' in t) t.query.invalidate(client, t.vars);
				else t.invalidate(client);
		});
	});
}
