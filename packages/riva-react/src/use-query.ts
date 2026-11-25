import type { Query, QueryState } from '@softistx/riva';
import { useMemo } from 'react';
import { type AnyQuery, useQueryState } from './query-state';
import { suspend } from './suspend';

export interface UseQueryOptions {
	/** `false` observes nothing and reads `idle`. Default true. */
	enabled?: boolean;
	/** Suspends while there is no data, and throws an error with no data to the nearest error boundary. Default false. */
	suspense?: boolean;
}

export type QueryResult<S> = S & {
	/** Marks the entry stale and fetches it; never rejects, read the error from the state. */
	refetch: () => Promise<void>;
};

/** The state of a `suspense: true` query: its data is there. */
export type SuspendedState<S extends QueryState<unknown>> = Omit<S, 'data'> & {
	data: Exclude<S['data'], undefined>;
};

// biome-ignore lint/suspicious/noConfusingVoidType: void variables are optional at call sites
type Void = void | undefined;
type Args<V, O> = [V] extends [Void]
	? [vars?: V, opts?: O]
	: [vars: V, opts?: O];
type SuspenseArgs<V, O> = [V] extends [Void]
	? [vars: V | undefined, opts: O]
	: [vars: V, opts: O];

/** A query's state for these variables, fetched while the component is mounted. */
export function useQuery<V, D, S extends QueryState<unknown>>(
	def: Query<V, D, S>,
	...args: SuspenseArgs<V, UseQueryOptions & { suspense: true }>
): QueryResult<SuspendedState<S>>;
export function useQuery<V, D, S extends QueryState<unknown>>(
	def: Query<V, D, S>,
	...args: Args<V, UseQueryOptions>
): QueryResult<S>;
export function useQuery(
	def: AnyQuery,
	vars?: unknown,
	opts?: UseQueryOptions,
): QueryResult<QueryState<unknown>> {
	const enabled = opts?.enabled !== false;
	const q = useQueryState<QueryState<unknown>>(
		def,
		vars,
		enabled,
		opts?.suspense === true,
	);
	const result = useMemo(
		() => ({ ...q.state, refetch: q.refetch }),
		[q.state, q.refetch],
	);
	let { state } = q;
	if (enabled && opts?.suspense && state.data === undefined) {
		if (state.status === 'success' && !state.isFetching) {
			// Stored data the cache cannot read (evicted): start its fetch now,
			// not in the mount effect, so the first render never shows undefined.
			q.client.queries.missing(def, q.vars);
			state = (q.client.get as (d: AnyQuery, v: unknown) => typeof state)(
				def,
				q.vars,
			);
		}
		if (state.status === 'error') throw state.error;
		if (state.status !== 'success' || state.isFetching)
			throw suspend(q.client, def, q.key, q.vars);
	}
	return result;
}
