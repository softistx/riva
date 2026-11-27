import { type Observable, Subscription } from 'rxjs';
import { type Query, type QueryOptions, query } from '../query';
import { isBrowser } from '../scope';

export interface LiveQueryOptions<Vars, Data>
	extends Omit<QueryOptions<Vars, Data>, 'fetch' | 'staleTime' | 'live'> {
	/** The stream behind the query, one per variables. Its first value is the query's first result. */
	observe: (vars: Vars) => Observable<Data>;
}

/**
 * A query fed by a stream: derived key, cached, `ensure`d and snapshotted like
 * any query, read with `useQuery`, `riva.get` and `riva.subscribe`.
 *
 * - on the server `ensure()` resolves at the first value, then unsubscribes
 *   (the request's abort stops a stream that stays silent);
 * - in a browser it stays subscribed while observed, and the data is kept for
 *   `gcTime` after the last release; there is no `staleTime`, an observed
 *   entry is live;
 * - an error after the first value sets the error state and keeps the data;
 *   `refetch()` (or a new observer after a release) subscribes again;
 * - `complete` keeps the last value and does not reconnect.
 */
export function liveQuery<Vars = void, Data = unknown>(
	opts: LiveQueryOptions<Vars, Data>,
): Query<Vars, Data> {
	const { observe, ...rest } = opts;
	const def: Query<Vars, Data> = query<Vars, Data>({
		...rest,
		live: true,
		staleTime: Infinity,
		fetch: (vars, { signal, riva, keep }) =>
			new Promise<Data>((resolve, reject) => {
				let first = true;
				const all = new Subscription();
				const stop = () => (all.unsubscribe(), true as const);
				all.add(
					observe(vars).subscribe({
						next(v) {
							if (!first) return def.setData(riva, vars, v);
							first = false;
							signal.removeEventListener('abort', stop);
							resolve(v);
							if (isBrowser() && keep) keep(stop);
							else stop();
						},
						error(e) {
							if (first) reject(e);
							else riva.queries.fail(def, vars, e);
						},
					}),
				);
				if (first) signal.addEventListener('abort', stop, { once: true });
				if (signal.aborted) stop();
			}),
	});
	return def;
}
