import { computed, type Readable } from './computed';
import { type Duration, ms } from './duration';
import {
	defaultEvents,
	defaultScheduler,
	noop,
	type RivaEvents,
	type Scheduler,
} from './env';
import { RivaError } from './errors';
import * as graph from './graph';
import type { Query, QueryState, VarsArgs } from './query';
import { createQueryCache, type QueryCache } from './query-cache';
import { withRiva } from './scope';
import type { Listener, Signal, Unsubscribe } from './signal';

// biome-ignore lint/suspicious/noConfusingVoidType: an effect may return nothing or a cleanup
export type EffectFn = () => void | (() => void);

export interface SubscribeOptions {
	/**
	 * Replaces the definition's `staleTime` when this observer decides whether
	 * to fetch on subscribing. Later invalidations and polls are unaffected.
	 */
	staleTime?: Duration;
}

export interface RivaOptions {
	/** Timers and clock; defaults to the host's. Inject a fake in tests. */
	scheduler?: Scheduler;
	/** Focus and reconnect events; defaults to the browser's, nothing on the server. */
	events?: RivaEvents;
	/** Riva-wide defaults, under a definition's own options. */
	defaults?: {
		/** Used by a query that sets no `staleTime`; built-in default 0 (1 s for an entry `hydrate` seeded). */
		staleTime?: Duration;
	};
}

/** What an adapter hands to `createRiva`: `install` runs once and its result becomes `riva[key]`. */
export interface RivaExtension<A> {
	install(riva: Riva): A;
}

/** The members `createRiva` adds for its extension options. */
export type Installed<O> = string extends keyof O
	? unknown
	: {
			readonly [K in keyof O as O[K] extends RivaExtension<unknown>
				? K
				: never]: O[K] extends RivaExtension<infer A> ? A : never;
		};

/** Holds every value. One per request on the server, one in the browser. */
export class Riva {
	/** @internal */
	readonly graph: graph.Graph = graph.createGraph(this);
	/** @internal */
	readonly queries: QueryCache;
	/** @internal Per-riva state of opt-in modules, by their own key. */
	readonly slots = new Map<unknown, unknown>();
	/** @internal Default `staleTime` (ms) of a query that sets none. */
	readonly staleTime: number;
	/** @internal `defaults.staleTime` when the options set it, else undefined. */
	readonly staleTimeSet: number | undefined;

	constructor(options: RivaOptions = {}) {
		this.staleTime = ms(options.defaults?.staleTime, 0) as number;
		this.staleTimeSet =
			options.defaults?.staleTime === undefined ? undefined : this.staleTime;
		this.queries = createQueryCache(
			this,
			options.scheduler ?? defaultScheduler,
			options.events ?? defaultEvents,
		);
		for (const k in options) {
			const x = (options as Record<string, RivaExtension<unknown> | undefined>)[
				k
			];
			if (x?.install) {
				if (k in this)
					throw new RivaError('RIVA_DEFINITION', `"${k}" is reserved.`);
				(this as Record<string, unknown>)[k] = x.install(this);
			}
		}
	}

	/** A query's state: a pure read, tracked in a computed or effect, never fetches. */
	get<Vars, Data, S extends QueryState<unknown>>(
		def: Query<Vars, Data, S>,
		...vars: VarsArgs<Vars>
	): S;
	get<T>(def: Readable<T>): T;
	get(
		// biome-ignore lint/suspicious/noExplicitAny: implementation of the overloads
		def: Readable<unknown> | Query<any, any>,
		vars?: unknown,
	): unknown {
		return def.kind === 'query'
			? this.queries.state(def, vars)
			: graph.read(this.graph, def);
	}

	set<T>(def: Signal<T>, value: NoInfer<T> | ((prev: T) => T)): void {
		graph.write(this.graph, def, value);
	}

	/** Observes a query: fetches when missing or stale, polls and refetches while observed. */
	subscribe<Vars, Data, S extends QueryState<unknown>>(
		def: Query<Vars, Data, S>,
		vars: Vars,
		listener: Listener<S>,
		opts?: SubscribeOptions,
	): Unsubscribe;
	subscribe<Data, S extends QueryState<unknown>>(
		def: Query<void, Data, S>,
		listener: Listener<S>,
	): Unsubscribe;
	subscribe<T>(def: Readable<T>, listener: Listener<T>): Unsubscribe;
	subscribe(
		// biome-ignore lint/suspicious/noExplicitAny: implementation of the overloads
		def: Readable<unknown> | Query<any, any, any>,
		a: unknown,
		b?: unknown,
		o?: SubscribeOptions,
	): Unsubscribe {
		if (def.kind !== 'query')
			return graph.subscribe(this.graph, def, a as Listener<unknown>);
		return typeof a === 'function'
			? this.queries.observe(def, undefined, a as Listener<QueryState<unknown>>)
			: this.queries.observe(def, a, b as Listener<QueryState<unknown>>, o);
	}

	/** Re-runs `fn` when what it read changes; the returned cleanup runs before each re-run and on dispose. */
	effect(fn: EffectFn): Unsubscribe {
		let cleanup: ReturnType<EffectFn>;
		const run = () => {
			const previous = cleanup;
			cleanup = undefined;
			if (previous) graph.untracked(this.graph, previous);
			cleanup = fn();
			return {};
		};
		const def = computed(run, { equals: () => false });
		this.get(def);
		const stop = this.subscribe(def, noop);
		return () => {
			stop();
			const previous = cleanup;
			cleanup = undefined;
			if (previous) this.run(previous);
		};
	}

	/** Runs `fn` with this riva as the ambient scope. */
	run<R>(fn: () => R): R {
		return withRiva(this, fn);
	}

	/** Defers notifications until the outermost batch ends. */
	batch<R>(fn: () => R): R {
		return graph.batch(this.graph, fn);
	}

	untracked<R>(fn: () => R): R {
		return graph.untracked(this.graph, fn);
	}
}

/** A riva, with its extensions installed and typed: `createRiva({ graphql: withGraphQL(client) })` gives `riva.graphql`. */
export const createRiva: {
	(options?: RivaOptions): Riva;
	<
		O extends RivaOptions & {
			// A key that is not an option must be an extension: a misspelt option is a type error.
			[K in Exclude<keyof O, keyof RivaOptions>]: RivaExtension<unknown>;
		} & { [K in keyof Riva]?: never },
	>(
		options: O,
	): Riva & Installed<O>;
} = (options?: RivaOptions) => new Riva(options) as never;
