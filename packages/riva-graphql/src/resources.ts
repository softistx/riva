import { stableKey } from '@softistx/riva';
import {
	abortable,
	type Resource,
	type ResourceState,
} from '@softistx/riva/resource';
import { RivaGraphQLError } from './errors';

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
 * A GraphQL response with data and errors is a `RivaGraphQLError` whose `data`
 * is the partial result: the state is `error` and keeps that data.
 */
const withPartial = <D>(s: ResourceState<D>): ResourceState<D> =>
	s.status === 'error' &&
	s.data === undefined &&
	s.error instanceof RivaGraphQLError &&
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
	return abortable(
		{
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
			then: (onFulfilled, onRejected) =>
				Promise.resolve(inner).then(onFulfilled, onRejected),
		},
		signal,
	);
}
