import {
	type Query,
	type QueryState,
	type RivaClient,
	stableKey,
} from '@softistx/riva';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useClient } from './context';

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
	client: RivaClient;
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
): QueryBinding<S> {
	const client = useClient();
	const stable = useStableVars(def.id, vars);
	const subscribe = useCallback(
		(notify: () => void) =>
			enabled ? client.subscribe(def, stable.vars, notify) : NOOP,
		[client, def, stable, enabled],
	);
	const read = () => (enabled ? client.get(def, stable.vars) : DISABLED) as S;
	const state = useSyncExternalStore(subscribe, read, read);
	const refetch = useCallback(async () => {
		def.invalidate(client, stable.vars);
		await def.ensure(client, stable.vars).catch(NOOP);
	}, [client, def, stable]);
	return { client, state, key: stable.key, vars: stable.vars, refetch };
}
