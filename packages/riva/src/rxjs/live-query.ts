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
				let sync = true;
				let got = false;
				let last!: Data;
				let late: { e: unknown } | undefined;
				const all = new Subscription();
				const stop = () => (all.unsubscribe(), true as const);
				const settle = (v: Data) => {
					first = false;
					resolve(v);
					if (isBrowser() && keep) keep(stop);
					else stop();
				};
				all.add(
					observe(vars).subscribe({
						next(v) {
							if (sync) {
								got = true;
								last = v;
							} else if (first) settle(v);
							else {
								push = true;
								def.setData(riva, vars, v);
								push = false;
							}
						},
						complete() {
							if (first && !got)
								reject(
									new RivaError(
										'RIVA_LIVE',
										`The stream of the live query "${def.id}" completed without a value.`,
									),
								);
						},
						error(e) {
							if (sync && got) late = { e };
							else if (first) reject(e);
							else riva.queries.fail(def, vars, e);
						},
					}),
				);
				sync = false;
				signal.addEventListener('abort', () => push || stop(), { once: true });
				if (signal.aborted) stop();
				else if (got && first) {
					settle(last);
					// a stream that failed right after its values: the error follows the value
					if (late && isBrowser())
						Promise.resolve()
							.then(() => def.ensure(riva, vars))
							.then(
								() => riva.queries.fail(def, vars, late?.e),
								() => {},
							);
				}
			}),
	});
	return def;
}
