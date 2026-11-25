import type { Infinite, InfiniteState } from '@softistx/riva/infinite';
import { useCallback, useMemo } from 'react';
import { type AnyQuery, useQueryState } from '../query-state';

export interface UseInfiniteQueryOptions {
	/** `false` observes nothing and reads `idle`. Default true. */
	enabled?: boolean;
}

export type InfiniteResult<Page, Node> = InfiniteState<Page, Node> & {
	/** Appends the page after the last one; a no-op without a next page. */
	fetchNext: () => Promise<void>;
	/** Prepends the page before the first one; a no-op without a previous page. */
	fetchPrevious: () => Promise<void>;
	/** Re-fetches every loaded page; never rejects, read the error from the state. */
	refetch: () => Promise<void>;
};

// biome-ignore lint/suspicious/noConfusingVoidType: void variables are optional at call sites
type Void = void | undefined;
type Args<V> = [V] extends [Void]
	? [vars?: V, opts?: UseInfiniteQueryOptions]
	: [vars: V, opts?: UseInfiniteQueryOptions];

/** An infinite list's state for these variables, with the actions that load more pages. */
export function useInfiniteQuery<V, Page, Node>(
	def: Infinite<V, Page, Node>,
	...args: Args<V>
): InfiniteResult<Page, Node>;
export function useInfiniteQuery(
	def: Infinite<unknown, unknown, unknown>,
	vars?: unknown,
	opts?: UseInfiniteQueryOptions,
): InfiniteResult<unknown, unknown> {
	const q = useQueryState<InfiniteState<unknown, unknown>>(
		def as AnyQuery,
		vars,
		opts?.enabled !== false,
	);
	const { riva, vars: v } = q;
	const more = (method: 'fetchNext' | 'fetchPrevious') =>
		(def[method] as (c: typeof riva, v: unknown) => Promise<void>)(riva, v);
	const fetchNext = useCallback(() => more('fetchNext'), [riva, def, v]);
	const fetchPrevious = useCallback(
		() => more('fetchPrevious'),
		[riva, def, v],
	);
	return useMemo(
		() => ({ ...q.state, fetchNext, fetchPrevious, refetch: q.refetch }),
		[q.state, fetchNext, fetchPrevious, q.refetch],
	);
}
