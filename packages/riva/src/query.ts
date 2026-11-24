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

/**
 * How a query entry stores its data. The default keeps it as is; a policy such
 * as `entities()` from `@softistx/riva/entities` normalizes it into shared
 * entities. `read` runs in a computed, so what it reads is tracked.
 */
export interface CachePolicy<Stored = unknown> {
	/** `prev` is what the entry stored before, so a policy can keep identities across writes. */
	write(client: RivaClient, data: unknown, prev?: Stored): Stored;
	read(client: RivaClient, stored: Stored): unknown;
	/** The entry was replaced or collected: drop what `write` retained. */
	release(client: RivaClient, stored: Stored): void;
	/** Mutations: shows `data` over the committed data until `drop` (an optimistic layer). */
	layer?(client: RivaClient, data: unknown): { drop(): void };
	/** Mutations: merges a server result into the committed data, notifying its readers. */
	commit?(client: RivaClient, data: unknown): void;
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
	/** How the data is stored. Default: as is (a keyed cache). */
	cache?: CachePolicy;
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
		readonly cache: CachePolicy | undefined;
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

const ms = (d: Duration | undefined, fallback?: number) =>
	d === undefined ? fallback : toMs(d);

export function query<Vars = void, Data = unknown>(
	opts: QueryOptions<Vars, Data>,
): Query<Vars, Data> {
	const def = {
		kind: 'query',
		id: opts.id,
		options: Object.freeze({
			...opts,
			staleTime: ms(opts.staleTime, 0),
			gcTime: ms(opts.gcTime),
			refetchOnFocus: opts.refetchOnFocus ?? true,
			refetchOnReconnect: opts.refetchOnReconnect ?? true,
			refetchEvery: ms(opts.refetchEvery),
		}),
	} as Record<string, unknown>;
	for (const m of ['ensure', 'prefetch', 'invalidate', 'setData', 'cancel'])
		def[m] = (client: RivaClient, ...args: unknown[]) =>
			(
				client.queries as unknown as Record<
					string,
					(...a: unknown[]) => unknown
				>
			)[m]?.(def, ...args);
	return Object.freeze(def) as unknown as Query<Vars, Data>;
}
