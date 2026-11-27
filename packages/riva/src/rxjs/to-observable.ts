import { distinctUntilChanged, map, Observable } from 'rxjs';
import type { Riva } from '../client';
import type { Readable } from '../computed';
import type { Query, QueryState, VarsArgs } from '../query';
import type { Listener, Unsubscribe } from '../signal';
import { type AsyncSource, fromAsyncIterable } from './from-async-iterable';

/** Anything with a current `state` and a `subscribe`: a mutation handle, a resource, a stream resource. */
export interface Stateful<S> {
	readonly state: S;
	subscribe(listener: Listener<S>): Unsubscribe;
}

/** What `data$` reads: any state that carries `data`. */
type WithData<D> = { readonly data: D };

/** Emits the current value at once, then each change; `listen` returns the stop. */
function observe<S>(
	read: () => S,
	listen: (next: Listener<S>) => Unsubscribe,
): Observable<S> {
	return new Observable<S>((sub) => {
		let last: S | undefined;
		let seen = false;
		const emit = (s: S) => {
			if (seen && Object.is(s, last)) return;
			seen = true;
			last = s;
			sub.next(s);
		};
		const stop = listen(emit);
		emit(read());
		return stop;
	});
}

/**
 * A cold Observable of full states, riva explicit. Subscribing emits the
 * current state, then each change; unsubscribing releases.
 *
 * - a query (with its variables): observes it like `useQuery` (fetches when
 *   missing or stale, polls, refetches), emitting `{ status, data, error, … }`;
 *   an error is a value, the stream never ends on it;
 * - a signal or computed: its value;
 * - a mutation handle (or any `{ state, subscribe }`): its state;
 * - an async iterable or a factory of one (no riva): see `fromAsyncIterable`.
 */
export function toObservable<Vars, Data, S extends QueryState<unknown>>(
	riva: Riva,
	def: Query<Vars, Data, S>,
	...vars: VarsArgs<Vars>
): Observable<S>;
export function toObservable<T>(riva: Riva, def: Readable<T>): Observable<T>;
export function toObservable<S>(riva: Riva, handle: Stateful<S>): Observable<S>;
export function toObservable<T>(source: AsyncSource<T>): Observable<T>;
export function toObservable(
	a: unknown,
	def?: unknown,
	vars?: unknown,
): Observable<unknown> {
	if (def === undefined) return fromAsyncIterable(a as AsyncSource<unknown>);
	const riva = a as Riva;
	const d = def as { kind?: string } & Partial<Stateful<unknown>>;
	if (d.kind === 'query') {
		// biome-ignore lint/suspicious/noExplicitAny: the overloads type it
		const q = d as Query<any, any>;
		return observe(
			() => riva.get(q, vars),
			(next) => riva.subscribe(q, vars, next),
		);
	}
	if (d.kind)
		return observe(
			() => riva.get(d as Readable<unknown>),
			(next) => riva.subscribe(d as Readable<unknown>, next),
		);
	const h = d as Stateful<unknown>;
	return observe(
		() => h.state,
		(next) => h.subscribe(next),
	);
}

/** `toObservable`, mapped to the data alone and without repeats (`undefined` until there is some). */
export function data$<Vars, Data, S extends QueryState<unknown>>(
	riva: Riva,
	def: Query<Vars, Data, S>,
	...vars: VarsArgs<Vars>
): Observable<S['data']>;
export function data$<D>(
	riva: Riva,
	handle: Stateful<WithData<D>>,
): Observable<D>;
export function data$(
	riva: Riva,
	def: unknown,
	...vars: unknown[]
): Observable<unknown> {
	return (toObservable as (...a: unknown[]) => Observable<WithData<unknown>>)(
		riva,
		def,
		...vars,
	).pipe(
		map((s) => s.data),
		distinctUntilChanged(),
	);
}
