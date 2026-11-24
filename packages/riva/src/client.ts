import type { Atom, Listener, Unsubscribe } from './atom';
import { computed, type Readable } from './computed';
import {
	type ClientEvents,
	defaultEvents,
	defaultScheduler,
	type Scheduler,
} from './env';
import * as graph from './graph';
import type { Query, QueryState, VarsArgs } from './query';
import { createQueryCache, type QueryCache } from './query-cache';
import { withClient } from './scope';

// biome-ignore lint/suspicious/noConfusingVoidType: an effect may return nothing or a cleanup
export type EffectFn = () => void | (() => void);

export interface ClientOptions {
	/** Timers and clock; defaults to the host's. Inject a fake in tests. */
	scheduler?: Scheduler;
	/** Focus and reconnect events; defaults to the browser's, nothing on the server. */
	events?: ClientEvents;
}

/** Holds every value. One per request on the server, one in the browser. */
export class RivaClient {
	/** @internal */
	readonly graph: graph.Graph = graph.createGraph(this);
	/** @internal */
	readonly queries: QueryCache;
	/** @internal Per-client state of opt-in modules, by their own key. */
	readonly slots = new Map<object, unknown>();

	constructor(options: ClientOptions = {}) {
		this.queries = createQueryCache(
			this,
			options.scheduler ?? defaultScheduler,
			options.events ?? defaultEvents,
		);
	}

	/** A query's state: a pure read, tracked in a computed or effect, never fetches. */
	get<Vars, Data>(
		def: Query<Vars, Data>,
		...vars: VarsArgs<Vars>
	): QueryState<Data>;
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

	set<T>(def: Atom<T>, value: NoInfer<T> | ((prev: T) => T)): void {
		graph.write(this.graph, def, value);
	}

	/** Observes a query: fetches when missing or stale, polls and refetches while observed. */
	subscribe<Vars, Data>(
		def: Query<Vars, Data>,
		vars: Vars,
		listener: Listener<QueryState<Data>>,
	): Unsubscribe;
	subscribe<Data>(
		def: Query<void, Data>,
		listener: Listener<QueryState<Data>>,
	): Unsubscribe;
	subscribe<T>(def: Readable<T>, listener: Listener<T>): Unsubscribe;
	subscribe(
		// biome-ignore lint/suspicious/noExplicitAny: implementation of the overloads
		def: Readable<unknown> | Query<any, any>,
		a: unknown,
		b?: unknown,
	): Unsubscribe {
		if (def.kind !== 'query')
			return graph.subscribe(this.graph, def, a as Listener<unknown>);
		return typeof a === 'function'
			? this.queries.observe(def, undefined, a as Listener<QueryState<unknown>>)
			: this.queries.observe(def, a, b as Listener<QueryState<unknown>>);
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
		const stop = this.subscribe(def, () => {});
		return () => {
			stop();
			const previous = cleanup;
			cleanup = undefined;
			if (previous) this.run(previous);
		};
	}

	/** Runs `fn` with this client as the ambient scope. */
	run<R>(fn: () => R): R {
		return withClient(this, fn);
	}

	/** Defers notifications until the outermost batch ends. */
	batch<R>(fn: () => R): R {
		return graph.batch(this.graph, fn);
	}

	untracked<R>(fn: () => R): R {
		return graph.untracked(this.graph, fn);
	}
}

export const createRivaClient = (options?: ClientOptions): RivaClient =>
	new RivaClient(options);
