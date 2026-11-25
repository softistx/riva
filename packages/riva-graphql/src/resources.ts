import {
	type Computed,
	type Riva,
	RivaAbortError,
	type Signal,
	stableKey,
} from '@softistx/riva';
import type { Resource, ResourceState } from '@softistx/riva/resource';
import { GraphQLError } from './errors';

/**
 * What a call takes as variables: a plain value, a riva signal or computed, or
 * a function that reads signals (tracked: when what it reads changes, the
 * query or subscription follows).
 */
export type VarsInput<Vars> =
	| Vars
	| Signal<Vars>
	| Computed<Vars>
	| (() => Vars);

/** Resolves a `VarsInput`; called inside the resource's tracked source. */
export function varsReader<Vars>(
	riva: Riva,
	input: VarsInput<Vars>,
): () => Vars {
	if (typeof input === 'function') return input as () => Vars;
	if (
		input &&
		typeof input === 'object' &&
		'kind' in input &&
		((input as { kind: unknown }).kind === 'signal' ||
			(input as { kind: unknown }).kind === 'computed')
	)
		return () => riva.get(input as Signal<Vars>);
	return () => input as Vars;
}

/**
 * The factory of a stream, memoised on the stable key of its variables: a
 * tracked source that re-derives equal variables returns the same factory, so
 * the stream does not reconnect.
 */
export function memoFactory<F>(
	id: string,
	make: (vars: never) => F,
): (vars: unknown) => F {
	let prev: { key: string; factory: F } | undefined;
	return (vars) => {
		const key = stableKey(id, vars);
		if (prev?.key !== key) prev = { key, factory: make(vars as never) };
		return prev.factory;
	};
}

/**
 * A GraphQL response with data and errors is a `GraphQLError` whose `data`
 * is the partial result: the state is `error` and keeps that data.
 */
const withPartial = <D>(s: ResourceState<D>): ResourceState<D> =>
	s.status === 'error' &&
	s.data === undefined &&
	s.error instanceof GraphQLError &&
	s.error.data != null
		? { ...s, data: s.error.data as D }
		: s;

/**
 * Wraps a core resource: partial results keep their data in `error` states
 * and a `signal` stops the wait of `await` (not the shared fetch).
 */
export function graphqlResource<D>(
	inner: Resource<D>,
	signal?: AbortSignal,
): Resource<D> {
	let from: ResourceState<D> | undefined;
	let to: ResourceState<D> | undefined;
	return {
		get state() {
			const s = inner.state;
			if (s !== from) {
				from = s;
				to = withPartial(s);
			}
			return to as ResourceState<D>;
		},
		subscribe: (l) => inner.subscribe((s) => l(withPartial(s))),
		// biome-ignore lint/suspicious/noThenProperty: a resource is awaitable on purpose
		then: (onFulfilled, onRejected) => {
			if (!signal) return Promise.resolve(inner).then(onFulfilled, onRejected);
			return new Promise<D>((resolve, reject) => {
				if (signal.aborted) return reject(new RivaAbortError());
				const abort = () => reject(new RivaAbortError());
				signal.addEventListener('abort', abort, { once: true });
				const done = () => signal.removeEventListener('abort', abort);
				inner.then(
					(d) => {
						done();
						resolve(d);
					},
					(e) => {
						done();
						reject(e);
					},
				);
			}).then(onFulfilled, onRejected);
		},
	};
}
