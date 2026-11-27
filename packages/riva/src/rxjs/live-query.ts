import { type Observable, Subscription } from 'rxjs';
import { RivaError } from '../errors';
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
				let push = false;
				const all = new Subscription();
				const stop = () => (all.unsubscribe(), true as const);
				all.add(
					observe(vars).subscribe({
						next(v) {
							if (!first) {
								push = true;
								def.setData(riva, vars, v);
								push = false;
								return;
							}
							first = false;
							resolve(v);
							if (isBrowser() && keep) keep(stop);
							else stop();
						},
						complete() {
							if (first)
								reject(
									new RivaError(
										'RIVA_LIVE',
										`The stream of the live query "${def.id}" completed without a value.`,
									),
								);
						},
						error(e) {
							if (first) reject(e);
							else riva.queries.fail(def, vars, e);
						},
					}),
				);
				signal.addEventListener('abort', () => push || stop(), { once: true });
				if (signal.aborted) stop();
			}),
	});
	return def;
}
