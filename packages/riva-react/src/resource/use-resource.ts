import type { Duration, Riva } from '@softistx/riva';
import {
	type Resource,
	type ResourceState,
	type StreamResource,
	toMs,
} from '@softistx/riva/resource';
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { useRiva } from '../context';
import { retryOnReset } from '../suspend';

export interface UseResourceOptions {
	/** Suspends while there is no data and throws an error to the nearest error boundary. Needs an awaitable resource. Default false. */
	suspense?: boolean;
	/** While a new key loads, show the previous key's data (`placeholder: true`). Default true. */
	keepPrevious?: boolean;
}

/** The state of a `suspense: true` hook: its data is there. */
export type SuspendedState<D> = Extract<
	ResourceState<D>,
	{ status: 'success' }
>;

/** The state of a disabled resource. */
export type IdleState = Extract<ResourceState<never>, { status: 'idle' }>;

/** What a Suspense mount trusts as fresh at least: the data its own render just fetched is not fetched again. */
const SUSPENSE_FRESH = 1000;

/**
 * The `staleTime` of a suspending fetch: the call's, else the definition's
 * (`def`), else the riva's default, but at least 1000 ms. An invalid duration
 * string throws `RIVA_DURATION`.
 */
export function suspenseStaleTime(
	riva: Riva,
	staleTime?: Duration,
	def?: { readonly options: { readonly staleTime?: number | undefined } },
): number {
	const own =
		staleTime === undefined
			? (def?.options.staleTime ?? riva.staleTime)
			: toMs(staleTime);
	return Math.max(own, SUSPENSE_FRESH);
}

// Held on the riva's slots: a request's pending loads die with its riva.
const SLOT = {};

/** The one promise React waits on for a key, so every render that suspends gets the same one. */
function suspendOn(riva: Riva, key: string, res: PromiseLike<unknown>) {
	let map = riva.slots.get(SLOT) as Map<string, PromiseLike<void>> | undefined;
	if (!map) {
		map = new Map();
		riva.slots.set(SLOT, map);
	}
	let promise = map.get(key);
	if (!promise) {
		const entries = map;
		const done = () => void entries.delete(key);
		promise = res.then(done, done);
		entries.set(key, promise);
	}
	return promise;
}

/**
 * The state of a resource, read through `useSyncExternalStore`. `make` builds
 * the resource for the riva in scope; it is rebuilt only when the riva or
 * `key` changes (the key is what identifies the resource: derive it from
 * everything `make` reads). The resource is observed while the component is
 * mounted, so it fetches on the client at mount and stops at unmount; on the
 * server nothing is observed, a render shows what a loader already put in the
 * riva (or suspends, with `suspense`).
 */
export function useResource<D>(
	key: string,
	make: (riva: Riva) => Resource<D>,
	opts: UseResourceOptions & { suspense: true },
): SuspendedState<D> | IdleState;
export function useResource<D>(
	key: string,
	make: (riva: Riva) => Resource<D> | StreamResource<D>,
	opts?: UseResourceOptions,
): ResourceState<D>;
export function useResource<D>(
	key: string,
	make: (riva: Riva) => Resource<D> | StreamResource<D>,
	opts: UseResourceOptions = {},
): ResourceState<D> {
	const riva = useRiva();
	const res = useMemo(() => make(riva), [riva, key]);
	const raw = useSyncExternalStore(
		useCallback((notify: () => void) => res.subscribe(notify), [res]),
		() => res.state,
		() => res.state,
	);
	// The last data shown, kept across keys (the resource keeps it across its own re-derivations).
	const last = useRef<unknown>(undefined);
	if (raw.status === 'idle') last.current = undefined;
	if (raw.status === 'success' && !raw.placeholder) last.current = raw.data;
	const kept = last.current;
	const state = useMemo<ResourceState<D>>(
		() =>
			opts.keepPrevious !== false &&
			raw.status === 'loading' &&
			raw.data === undefined &&
			kept !== undefined
				? {
						status: 'success',
						data: kept as D,
						error: undefined,
						isFetching: true,
						placeholder: true,
					}
				: raw,
		[raw, kept, opts.keepPrevious],
	);
	if (opts.suspense && state.status !== 'idle') {
		if (state.status === 'error' && !retryOnReset(riva, state.error))
			throw state.error;
		// Loading, or an error being retried: suspend on a fresh fetch.
		if (state.status !== 'success') {
			if (!('then' in res))
				throw new TypeError(
					'useResource: `suspense` needs an awaitable resource, not a stream.',
				);
			throw suspendOn(riva, key, res);
		}
	}
	return state;
}
