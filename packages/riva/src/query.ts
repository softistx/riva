import type { RivaClient } from './client';
import { type Duration, toMs } from './duration';

export type QueryStatus = 'idle' | 'pending' | 'success' | 'error';

/**
 * What a query entry holds. `status` stays `success` with the old data during
 * a background refetch (`isFetching` is true); an error keeps the last data.
 */
export interface QueryState<Data> {
	readonly status: QueryStatus;
	readonly data: Data | undefined;
	readonly error: unknown;
	readonly isFetching: boolean;
	/** Epoch milliseconds of the last success (0 when none). */
	readonly updatedAt: number;
}

export interface FetchContext {
	signal: AbortSignal;
	client: RivaClient;
}

export interface QueryOptions<Vars, Data> {
	/** Identifies the definition; the cache key is the id plus the stable-serialized variables. */
	id: string;
	fetch: (vars: Vars, ctx: FetchContext) => Promise<Data>;
	/** How long data stays fresh. Default 0. */
	staleTime?: Duration;
	/** How long an unobserved entry is kept. Default 5 min in a browser, `Infinity` on the server. */
	gcTime?: Duration;
	/** A count of retries, or a decision. `failures` is the number of failures before this one. Default 3 in a browser, 0 on the server. */
	retry?: number | ((failures: number, error: unknown) => boolean);
	/** Delay before a retry, in ms. Default `min(1000 * 2 ** failures, 30_000)`. */
	retryDelay?: (failures: number) => number;
	/** Default true. */
	refetchOnFocus?: boolean;
	/** Default true. */
	refetchOnReconnect?: boolean;
	/** Polls while the entry is observed. */
	refetchEvery?: Duration;
}

export interface EnsureOptions {
	signal?: AbortSignal;
}

/** The variables argument, optional when `Vars` is `void` or `undefined`. */
export type VarsArgs<Vars, Rest extends unknown[] = []> = [Vars] extends [
	// biome-ignore lint/suspicious/noConfusingVoidType: void variables are optional at call sites
	void | undefined,
]
	? [vars?: Vars, ...rest: Rest]
	: [vars: Vars, ...rest: Rest];

/** A stateless query definition: the data lives in a `RivaClient`. */
export interface Query<Vars, Data> {
	readonly kind: 'query';
	readonly id: string;
	/** @internal */
	readonly options: {
		readonly fetch: QueryOptions<Vars, Data>['fetch'];
		readonly staleTime: number;
		readonly gcTime: number | undefined;
		readonly retry: QueryOptions<Vars, Data>['retry'];
		readonly retryDelay: QueryOptions<Vars, Data>['retryDelay'];
		readonly refetchOnFocus: boolean;
		readonly refetchOnReconnect: boolean;
		readonly refetchEvery: number | undefined;
	};
	/** Fetches when missing or stale and awaits; resolves the cache when fresh. */
	ensure(
		client: RivaClient,
		...args: VarsArgs<Vars, [opts?: EnsureOptions]>
	): Promise<Data>;
	/** Fire and forget; never rejects. */
	prefetch(client: RivaClient, ...args: VarsArgs<Vars>): void;
	/** Marks stale (one entry, or every entry of the definition without variables); observed entries refetch. */
	invalidate(client: RivaClient, vars?: Vars): void;
	/** Writes a success with `updatedAt` now. */
	setData(
		client: RivaClient,
		vars: Vars,
		data: Data | ((prev: Data | undefined) => Data),
	): void;
	/** Aborts the in-flight fetch and restores the previous state. */
	cancel(client: RivaClient, ...args: VarsArgs<Vars>): void;
}

export function query<Vars = void, Data = unknown>(
	opts: QueryOptions<Vars, Data>,
): Query<Vars, Data> {
	const def = Object.freeze({
		kind: 'query',
		id: opts.id,
		options: Object.freeze({
			fetch: opts.fetch,
			staleTime: opts.staleTime === undefined ? 0 : toMs(opts.staleTime),
			gcTime: opts.gcTime === undefined ? undefined : toMs(opts.gcTime),
			retry: opts.retry,
			retryDelay: opts.retryDelay,
			refetchOnFocus: opts.refetchOnFocus ?? true,
			refetchOnReconnect: opts.refetchOnReconnect ?? true,
			refetchEvery:
				opts.refetchEvery === undefined ? undefined : toMs(opts.refetchEvery),
		}),
		ensure: (client: RivaClient, vars?: Vars, o?: EnsureOptions) =>
			client.queries.ensure(def, vars as Vars, o),
		prefetch: (client: RivaClient, vars?: Vars) =>
			client.queries.prefetch(def, vars as Vars),
		invalidate: (client: RivaClient, vars?: Vars) =>
			client.queries.invalidate(def, vars),
		setData: (
			client: RivaClient,
			vars: Vars,
			data: Data | ((prev: Data | undefined) => Data),
		) => client.queries.setData(def, vars, data),
		cancel: (client: RivaClient, vars?: Vars) =>
			client.queries.cancel(def, vars as Vars),
	}) as Query<Vars, Data>;
	return def;
}
