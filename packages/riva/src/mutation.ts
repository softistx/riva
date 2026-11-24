import type { RivaClient } from './client';
import { execute } from './mutation-run';
import type { CachePolicy, FetchContext, Query, VarsArgs } from './query';
import type { AnyQuery } from './query-entry';

/** What `optimistic` and `updates` write through. */
export interface Tx {
	/**
	 * In `optimistic`: a layer over the query's data, dropped when the mutation
	 * settles (the updater gets the value below). In `updates`: the committed
	 * data (the updater gets the committed value).
	 */
	set<V, D>(
		query: Query<V, D>,
		vars: V,
		data: D | ((prev: D | undefined) => D),
	): void;
}

/** One entry of a query, built by `at`. */
export interface Target {
	readonly query: AnyQuery;
	readonly vars: unknown;
}

/** A query to invalidate (every entry), or `at(query, vars)` (one entry). */
export type Invalidation = AnyQuery | Target;

/** The entry of `query` with these variables, checked against the query's `Vars`. */
// biome-ignore lint/suspicious/noExplicitAny: any data type
export const at = <V>(query: Query<V, any>, vars: V): Target => ({
	query: query as AnyQuery,
	vars,
});

export interface MutationOptions<Vars, Data> {
	/** Identifies the definition. */
	id: string;
	/** Sends the mutation. */
	run: (vars: Vars, ctx: FetchContext) => Promise<Data>;
	/** Normalizes the optimistic data and the server result (`entities()`). */
	cache?: CachePolicy;
	/** Shows the expected result at once: `tx.set` layers, and the returned data into the entities. */
	// biome-ignore lint/suspicious/noConfusingVoidType: nothing to return is allowed
	optimistic?: (vars: Vars, tx: Tx) => Data | void;
	/** Queries to mark stale (observed ones refetch) once the mutation succeeded. */
	invalidates?:
		| readonly Invalidation[]
		| ((data: Data, vars: Vars) => readonly Invalidation[]);
	/** Writes the server result into committed query data. */
	updates?: (tx: Tx, data: Data, vars: Vars) => void;
	/** A count of retries, or a decision. Default 0. */
	retry?: number | ((failures: number, error: unknown) => boolean);
	/** Delay before a retry, in ms. Default `min(1000 * 2 ** failures, 30_000)`. */
	retryDelay?: (failures: number) => number;
}

export interface RunOptions {
	signal?: AbortSignal;
}

/** A stateless mutation definition. */
export interface Mutation<Vars, Data> {
	readonly kind: 'mutation';
	readonly id: string;
	/** @internal */
	readonly options: MutationOptions<Vars, Data>;
	/** Resolves with the server data; rejects with the error, after the rollback. */
	run(
		client: RivaClient,
		...args: VarsArgs<Vars, [opts?: RunOptions]>
	): Promise<Data>;
}

export function mutation<Vars = void, Data = unknown>(
	options: MutationOptions<Vars, Data>,
): Mutation<Vars, Data> {
	const def: Mutation<Vars, Data> = Object.freeze({
		kind: 'mutation',
		id: options.id,
		options,
		run: (client: RivaClient, vars?: Vars, opts?: RunOptions) =>
			execute(client, options, vars as Vars, opts),
	} as Mutation<Vars, Data>);
	return def;
}
