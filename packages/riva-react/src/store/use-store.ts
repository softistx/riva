import {
	type Readable,
	type Riva,
	RivaError,
	type Signal,
	signal,
} from '@softistx/riva';
import {
	useCallback,
	useLayoutEffect,
	useMemo,
	useSyncExternalStore,
} from 'react';
import { useRiva } from '../context';

interface Tracker {
	/** What the renders since the view was last built read: not committed yet. */
	keys: Set<Readable<unknown>>;
	/** What the last committed render read: the keys the subscription watches. */
	committed: Readable<unknown>[];
	/** What the last render, or the last check, saw of each. */
	seen: Map<Readable<unknown>, unknown>;
	ver: number;
	/** Bumped after a commit that read other keys, so the subscription follows. */
	tick: Signal<number>;
}

const isMember = (m: unknown): m is Readable<unknown> =>
	(m as Readable<unknown> | undefined)?.kind === 'signal' ||
	(m as Readable<unknown> | undefined)?.kind === 'computed';

/**
 * A store's state and computeds as `s`, and its actions as `a`, bound to the
 * provider's riva. `s` is tracked per key: the component re-renders only
 * when a key it read changes, and `s` is a new object after each change, so
 * `useMemo([s])` and `React.memo` children follow it.
 */
export function useStore<V, B>(def: {
	readonly name: string;
	bind(riva: Riva): readonly [V, B];
}): readonly [V, B] {
	const riva = useRiva();
	const t = useMemo<Tracker>(
		() => ({
			keys: new Set(),
			committed: [],
			seen: new Map(),
			ver: 0,
			tick: signal(0),
		}),
		[riva, def],
	);

	const subscribe = useCallback(
		(notify: () => void) =>
			riva.effect(() => {
				riva.get(t.tick);
				let changed = false;
				for (const m of t.committed) {
					const v = riva.get(m);
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
		[riva, t],
	);
	const read = () => t.ver;
	const ver = useSyncExternalStore(subscribe, read, read);

	const a = def.bind(riva)[1];
	// A new view per version: what read the old one re-renders, and starts a
	// new set of keys. Reads made by a render that is not committed stay in `keys`.
	const s = useMemo(() => {
		t.keys.clear();
		return new Proxy(
			{},
			{
				get: (_, k) => {
					const m = (def as unknown as Record<PropertyKey, unknown>)[k];
					if (!isMember(m)) return undefined;
					const v = riva.get(m);
					t.keys.add(m);
					t.seen.set(m, v);
					return v;
				},
				set: (_, k) => {
					throw new RivaError(
						'RIVA_STORE',
						`Store "${def.name}": "${String(k)}" is read-only here; write it in an action.`,
					);
				},
			},
		) as V;
	}, [t, ver, a]);

	useLayoutEffect(() => {
		const next = [...t.keys];
		if (
			next.length !== t.committed.length ||
			next.some((m) => !t.committed.includes(m))
		) {
			t.committed = next;
			riva.set(t.tick, (n) => n + 1);
		}
	});

	return useMemo(() => [s, a] as const, [s, a]);
}
