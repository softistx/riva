import type { Query } from '@softistx/riva';
import { useClient } from '@softistx/riva-react';
import { useEffect, useRef } from 'react';

/**
 * Writes an action's result into a query's entry, once per result: pass
 * `useActionData()` or a fetcher's `data`. The result is the entry's data, or
 * `select` picks it (required when the types differ); a result that selects
 * `undefined` (a validation error, say) writes nothing.
 */
export function useActionResult<R, V, D>(
	result: R | undefined,
	opts: {
		/** The query whose entry receives the result. */
		into: Query<V, D>;
		/** The entry's variables. */
		vars: V;
		/** Picks the data out of the result; `undefined` writes nothing. */
		select: (result: NoInfer<R>) => D | undefined;
	},
): void;
export function useActionResult<V, D>(
	result: D | undefined,
	opts: { into: Query<V, D>; vars: V; select?: undefined },
): void;
export function useActionResult<R, V, D>(
	result: R | undefined,
	opts: {
		into: Query<V, D>;
		vars: V;
		select?: ((result: R) => D | undefined) | undefined;
	},
): void {
	const client = useClient();
	const last = useRef<unknown>(undefined);
	const latest = useRef(opts);
	latest.current = opts;
	useEffect(() => {
		if (result === undefined || Object.is(last.current, result)) return;
		last.current = result;
		const { select, into, vars } = latest.current;
		const data = select ? select(result) : (result as unknown as D);
		if (data !== undefined) into.setData(client, vars, data);
	}, [result, client]);
}
