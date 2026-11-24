import { type Atom, atom, type Listener, type Unsubscribe } from './atom';
import type { RivaClient } from './client';
import type { ClientEvents, Scheduler } from './env';
import { RivaAbortError } from './errors';
import { nodeOf } from './graph';
import { stableKey } from './key';
import type { EnsureOptions, Query, QueryState } from './query';
import { raceAbort, retryDelay, shouldRetry, sleep } from './retry';
import { isBrowser } from './scope';

// biome-ignore lint/suspicious/noExplicitAny: entries of every definition share one map
type AnyQuery = Query<any, any>;
type State = QueryState<unknown>;

interface Inflight {
	promise: Promise<unknown>;
	/** Replaced on a restart (invalidate while in flight). */
	controller: AbortController;
	waiters: number;
	/** Set by cancel: the promise rejects with `RivaAbortError`. A bare abort is a restart. */
	cancelled: boolean;
	/** The state to restore on cancel. */
	prev: State;
}

interface Entry {
	key: string;
	def: AnyQuery;
	vars: unknown;
	/** The graph atom holding `state`: the one notification mechanism. */
	atom: Atom<State>;
	state: State;
	observers: number;
	invalidated: boolean;
	inflight: Inflight | undefined;
	gc: unknown;
	poll: unknown;
}

const IDLE: State = Object.freeze({
	status: 'idle',
	data: undefined,
	error: undefined,
	isFetching: false,
	updatedAt: 0,
});
const noop = () => {};

/** The query entries of one client. Held by the client, created on first use. */
export class QueryCache {
	readonly #client: RivaClient;
	readonly #sched: Scheduler;
	readonly #events: ClientEvents;
	readonly #entries = new Map<string, Entry>();
	#observed = 0;
	#detach: (() => void) | undefined;

	constructor(client: RivaClient, sched: Scheduler, events: ClientEvents) {
		this.#client = client;
		this.#sched = sched;
		this.#events = events;
	}

	#entry(def: AnyQuery, vars: unknown): Entry {
		const key = stableKey(def.id, vars);
		let e = this.#entries.get(key);
		if (!e) {
			e = {
				key,
				def,
				vars,
				atom: atom<State>(IDLE, { name: key }),
				state: IDLE,
				observers: 0,
				invalidated: false,
				inflight: undefined,
				gc: undefined,
				poll: undefined,
			};
			this.#entries.set(key, e);
			this.#scheduleGc(e);
		}
		return e;
	}

	#set(e: Entry, next: State): void {
		e.state = next;
		this.#client.set(e.atom, next);
	}

	#needsFetch(e: Entry): boolean {
		return (
			e.state.status !== 'success' ||
			e.invalidated ||
			this.#sched.now() - e.state.updatedAt >= e.def.options.staleTime
		);
	}

	#scheduleGc(e: Entry): void {
		this.#sched.clearTimeout(e.gc);
		e.gc = undefined;
		if (e.observers > 0) return;
		const ms = e.def.options.gcTime ?? (isBrowser() ? 300_000 : Infinity);
		if (!Number.isFinite(ms)) return;
		e.gc = this.#sched.setTimeout(() => {
			e.gc = undefined;
			// A computed or listener still reading the atom keeps the entry alive.
			if (
				e.observers > 0 ||
				e.inflight ||
				nodeOf(this.#client.graph, e.atom).refs > 0
			)
				return this.#scheduleGc(e);
			if (this.#entries.get(e.key) === e) this.#entries.delete(e.key);
		}, ms);
	}

	async #run(e: Entry, inflight: Inflight): Promise<unknown> {
		const { fetch, retry, retryDelay: delayFn } = e.def.options;
		let failures = 0;
		for (;;) {
			const ctl = inflight.controller;
			if (ctl.signal.aborted) {
				if (inflight.cancelled) throw new RivaAbortError();
				failures = 0; // restarted by invalidate: a fresh attempt
				continue;
			}
			let ok = false;
			let value: unknown;
			try {
				value = await raceAbort(
					fetch(e.vars, { signal: ctl.signal, client: this.#client }),
					ctl.signal,
				);
				ok = true;
			} catch (error) {
				value = error;
			}
			if (ctl.signal.aborted) continue; // handled at the top
			if (ok) return value;
			if (!shouldRetry(retry, failures, value)) throw value;
			await sleep(this.#sched, retryDelay(delayFn, failures), ctl.signal);
			failures++;
		}
	}

	#start(e: Entry): Inflight {
		const inflight: Inflight = {
			promise: undefined as unknown as Promise<unknown>,
			controller: new AbortController(),
			waiters: 0,
			cancelled: false,
			prev: e.state,
		};
		e.inflight = inflight;
		this.#set(e, {
			...e.state,
			status: e.state.status === 'success' ? 'success' : 'pending',
			isFetching: true,
		});
		inflight.promise = this.#run(e, inflight).then(
			(data) => {
				if (e.inflight === inflight) {
					e.inflight = undefined;
					e.invalidated = false;
					this.#set(e, {
						status: 'success',
						data,
						error: undefined,
						isFetching: false,
						updatedAt: this.#sched.now(),
					});
					this.#scheduleGc(e);
				}
				return data;
			},
			(error) => {
				if (e.inflight === inflight) {
					e.inflight = undefined;
					this.#set(e, {
						...e.state,
						status: 'error',
						error,
						isFetching: false,
					});
					this.#scheduleGc(e);
				}
				throw error;
			},
		);
		inflight.promise.catch(noop); // callers handle their own copy
		return inflight;
	}

	#fetchQuietly(e: Entry): void {
		(e.inflight ?? this.#start(e)).promise.catch(noop);
	}

	#cancel(e: Entry): void {
		const inflight = e.inflight;
		if (!inflight) return;
		inflight.cancelled = true;
		e.inflight = undefined;
		inflight.controller.abort();
		this.#set(e, inflight.prev);
		this.#scheduleGc(e);
	}

	/** Aborts a fetch nobody waits for or observes any more. */
	#abandon(e: Entry, inflight: Inflight | undefined): void {
		if (
			inflight &&
			e.inflight === inflight &&
			inflight.waiters === 0 &&
			e.observers === 0
		)
			this.#cancel(e);
	}

	// biome-ignore lint/suspicious/noExplicitAny: variables are typed by the caller
	state<Data>(def: Query<any, Data>, vars: unknown): QueryState<Data> {
		return this.#client.get(this.#entry(def, vars).atom) as QueryState<Data>;
	}

	ensure<Vars, Data>(
		def: Query<Vars, Data>,
		vars: Vars,
		opts?: EnsureOptions,
	): Promise<Data> {
		const signal = opts?.signal;
		if (signal?.aborted) return Promise.reject(new RivaAbortError());
		const e = this.#entry(def, vars);
		if (!this.#needsFetch(e)) return Promise.resolve(e.state.data as Data);
		const inflight = e.inflight ?? this.#start(e);
		inflight.waiters++;
		return new Promise<Data>((resolve, reject) => {
			let settled = false;
			const finish = () => {
				settled = true;
				inflight.waiters--;
				signal?.removeEventListener('abort', onAbort);
			};
			const onAbort = () => {
				if (settled) return;
				finish();
				reject(new RivaAbortError());
				this.#abandon(e, inflight);
			};
			signal?.addEventListener('abort', onAbort, { once: true });
			inflight.promise.then(
				(v) => {
					if (settled) return;
					finish();
					resolve(v as Data);
				},
				(err) => {
					if (settled) return;
					finish();
					reject(err);
				},
			);
		});
	}

	prefetch(def: AnyQuery, vars: unknown): void {
		const e = this.#entry(def, vars);
		if (this.#needsFetch(e)) this.#fetchQuietly(e);
	}

	invalidate(def: AnyQuery, vars?: unknown): void {
		for (const e of [...this.#entries.values()]) {
			if (e.def.id !== def.id) continue;
			if (vars !== undefined && e.key !== stableKey(def.id, vars)) continue;
			e.invalidated = true;
			if (e.observers === 0) continue;
			if (e.inflight) {
				e.inflight.controller.abort();
				e.inflight.controller = new AbortController();
			} else this.#fetchQuietly(e);
		}
	}

	setData<Data>(
		// biome-ignore lint/suspicious/noExplicitAny: variables are typed by the caller
		def: Query<any, Data>,
		vars: unknown,
		data: Data | ((prev: Data | undefined) => Data),
	): void {
		const e = this.#entry(def, vars);
		this.#cancel(e);
		const next =
			typeof data === 'function'
				? (data as (prev: Data | undefined) => Data)(
						e.state.data as Data | undefined,
					)
				: data;
		e.invalidated = false;
		this.#set(e, {
			status: 'success',
			data: next,
			error: undefined,
			isFetching: false,
			updatedAt: this.#sched.now(),
		});
	}

	cancel(def: AnyQuery, vars: unknown): void {
		const e = this.#entries.get(stableKey(def.id, vars));
		if (e) this.#cancel(e);
	}

	observe<Data>(
		// biome-ignore lint/suspicious/noExplicitAny: variables are typed by the caller
		def: Query<any, Data>,
		vars: unknown,
		listener: Listener<QueryState<Data>>,
	): Unsubscribe {
		const e = this.#entry(def, vars);
		this.#sched.clearTimeout(e.gc);
		e.gc = undefined;
		e.observers++;
		this.#attach();
		const off = this.#client.subscribe(e.atom, listener as Listener<State>);
		if (e.observers === 1) this.#poll(e);
		if (this.#needsFetch(e)) this.#fetchQuietly(e);
		let done = false;
		return () => {
			if (done) return;
			done = true;
			off();
			if (--e.observers > 0) return;
			this.#sched.clearTimeout(e.poll);
			e.poll = undefined;
			this.#abandon(e, e.inflight);
			this.#scheduleGc(e);
			this.#release();
		};
	}

	#poll(e: Entry): void {
		const ms = e.def.options.refetchEvery;
		if (ms === undefined || !(ms > 0) || !Number.isFinite(ms)) return;
		e.poll = this.#sched.setTimeout(() => {
			if (e.observers === 0) return;
			this.#poll(e);
			this.#fetchQuietly(e);
		}, ms);
	}

	#refetchObserved(flag: 'refetchOnFocus' | 'refetchOnReconnect'): void {
		for (const e of this.#entries.values())
			if (
				e.observers > 0 &&
				e.def.options[flag] &&
				!e.inflight &&
				this.#needsFetch(e)
			)
				this.#fetchQuietly(e);
	}

	#attach(): void {
		if (this.#observed++ > 0) return;
		const offFocus = this.#events.onFocus(() =>
			this.#refetchObserved('refetchOnFocus'),
		);
		const offOnline = this.#events.onReconnect(() =>
			this.#refetchObserved('refetchOnReconnect'),
		);
		this.#detach = () => {
			offFocus();
			offOnline();
		};
	}

	#release(): void {
		if (--this.#observed > 0) return;
		this.#detach?.();
		this.#detach = undefined;
	}
}
