import {
	FRESH_FLOOR_MS,
	type Query,
	type QueryState,
	type Riva,
	stableKey,
} from '@softistx/riva';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useRiva } from './context';
import { handoff } from './suspend';

// biome-ignore lint/suspicious/noExplicitAny: any query definition
export type AnyQuery = Query<any, any, any>;

const NOOP = () => {};

/** What a disabled query reads: idle, with no entry created. */
const DISABLED: QueryState<never> = Object.freeze({
	status: 'idle',
	data: undefined,
	error: undefined,
	isFetching: false,
	updatedAt: 0,
});

/** The variables of the first render that produced this key: an inline `{ a }` never resubscribes. */
export function useStableVars<V>(
	id: string,
	vars: V,
): { key: string; vars: V } {
	const key = stableKey(id, vars);
	const ref = useRef<{ key: string; vars: V } | undefined>(undefined);
	if (ref.current?.key !== key) ref.current = { key, vars };
	return ref.current;
}

export interface QueryBinding<S> {
	riva: Riva;
	state: S;
	key: string;
	vars: unknown;
	/** Marks the entry stale and fetches it; never rejects, the error is in the state. */
	refetch: () => Promise<void>;
}

/** Observes a query entry through `useSyncExternalStore`; nothing is observed while disabled. */
export function useQueryState<S extends QueryState<unknown>>(
	def: AnyQuery,
	vars: unknown,
	enabled: boolean,
	suspense = false,
): QueryBinding<S> {
	const riva = useRiva();
	const stable = useStableVars(def.id, vars);
	const subscribe = useCallback(
		(notify: () => void) => {
			if (!enabled) return NOOP;
			const off = riva.subscribe(
				def,
				stable.vars,
				notify,
				// What a Suspense render just fetched is not fetched again on mount.
				suspense ? { minFresh: FRESH_FLOOR_MS } : undefined,
			);
			// This observer now keeps the entry (and its stream) open.
			handoff(riva, stable.key);
			return off;
		},
		[riva, def, stable, enabled, suspense],
	);
	const read = () => (enabled ? riva.get(def, stable.vars) : DISABLED) as S;
	const state = useSyncExternalStore(subscribe, read, read);
	const refetch = useCallback(async () => {
		def.invalidate(riva, stable.vars);
		await def.ensure(riva, stable.vars).catch(NOOP);
	}, [riva, def, stable]);
	return { riva, state, key: stable.key, vars: stable.vars, refetch };
}
