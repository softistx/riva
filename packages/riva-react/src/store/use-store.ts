import {
	type Readable,
	type RivaClient,
	type Signal,
	signal,
} from '@softistx/riva';
import {
	useCallback,
	useLayoutEffect,
	useMemo,
	useSyncExternalStore,
} from 'react';
import { useClient } from '../context';

interface Tracker {
	/** What this render read. */
	keys: Set<Readable<unknown>>;
	/** What the last render, or the last check, saw of each. */
	seen: Map<Readable<unknown>, unknown>;
	/** What the subscription watches now. */
	watched: Readable<unknown>[];
	ver: number;
	/** Bumped after a commit that read other keys, so the subscription follows. */
	tick: Signal<number>;
	view: unknown;
}

const isMember = (m: unknown): m is Readable<unknown> =>
	(m as Readable<unknown> | undefined)?.kind === 'signal' ||
	(m as Readable<unknown> | undefined)?.kind === 'computed';

/**
 * A store's state and computeds as `s`, and its actions as `a`, bound to the
 * provider's client. `s` is tracked per key: the component re-renders only
 * when a key it read changes.
 */
export function useStore<V, B>(def: {
	bind(client: RivaClient): readonly [V, B];
}): readonly [V, B] {
	const client = useClient();
	const t = useMemo<Tracker>(() => {
		const tracker = {
			keys: new Set(),
			seen: new Map(),
			watched: [],
			ver: 0,
			tick: signal(0),
		} as unknown as Tracker;
		tracker.view = new Proxy(
			{},
			{
				get: (_, k) => {
					const m = (def as unknown as Record<PropertyKey, unknown>)[k];
					if (!isMember(m)) return undefined;
					const v = client.get(m);
					tracker.keys.add(m);
					tracker.seen.set(m, v);
					return v;
				},
				set: () => {
					throw new Error(
						'A store is written in its actions: call a(…) from useStore.',
					);
				},
			},
		);
		return tracker;
	}, [client, def]);
	t.keys.clear();

	const subscribe = useCallback(
		(notify: () => void) =>
			client.effect(() => {
				client.get(t.tick);
				t.watched = [...t.keys];
				let changed = false;
				for (const m of t.watched) {
					const v = client.get(m);
					if (!Object.is(t.seen.get(m), v)) {
						t.seen.set(m, v);
						changed = true;
					}
				}
				if (changed) {
					t.ver++;
					notify();
				}
			}),
		[client, t],
	);
	const read = () => t.ver;
	useSyncExternalStore(subscribe, read, read);

	useLayoutEffect(() => {
		if (
			t.keys.size !== t.watched.length ||
			t.watched.some((m) => !t.keys.has(m))
		)
			client.set(t.tick, (n) => n + 1);
	});

	const a = def.bind(client)[1];
	return useMemo(() => [t.view as V, a] as const, [t, a]);
}
