import type { Riva } from '../client';
import { computed } from '../computed';
import type { Duration } from '../duration';
import { RivaError } from '../errors';
import { stableKey } from '../key';
import type { Query, QueryState } from '../query';
import type { Listener, Unsubscribe } from '../signal';
import { lazy } from './lazy';
import { IDLE, type ResourceState, sameState } from './types';

export interface ResourceOptions {
	/** A boolean, or a function read in a tracked computed. While false the state is `idle`, `source` is not called and nothing is fetched. Default true. */
	enabled?: boolean | (() => boolean);
	/** While a new key loads, show the previous key's data (`placeholder: true`). Default true. */
	keepPrevious?: boolean;
	/** Replaces the definition's `staleTime` for this resource's fetch decisions. */
	staleTime?: Duration;
}

/** A reactive, awaitable view of one query entry. */
export interface Resource<D> extends PromiseLike<D> {
	/** The current state: tracked when read in a computed or effect. */
	readonly state: ResourceState<D>;
	/** Calls `listener` on each change of the state; the returned function undoes it. The first subscriber starts the fetch. */
	subscribe(listener: Listener<ResourceState<D>>): Unsubscribe;
}

interface Target {
	def: Query<never, unknown>;
	vars: unknown;
}

const sameTarget = (a: Target | undefined, b: Target | undefined): boolean =>
	a === b ||
	(!!a &&
		!!b &&
		a.def === b.def &&
		stableKey(a.def.id, a.vars) === stableKey(b.def.id, b.vars));

/**
 * A resource over a query entry. `source` returns the definition and its
 * variables and runs in a tracked computed: when what it reads changes, the
 * key is derived again, the new entry is observed and the old one released.
 * Observation is lazy (first subscriber or observed reader, until the last)
 * and browser-only; awaiting the resource is a one-shot load that works
 * anywhere and rejects with the error, or with a `RivaError` when disabled.
 */
export function resource<Vars, Data>(
	riva: Riva,
	source: () => readonly [def: Query<Vars, Data>, vars: Vars],
	opts: ResourceOptions = {},
): Resource<Data> {
	const { enabled = true, keepPrevious = true, staleTime } = opts;
	const target = computed<Target | undefined>(
		() => {
			if (typeof enabled === 'function' ? !enabled() : !enabled) return;
			const [def, vars] = source();
			return { def, vars } as Target;
		},
		{ equals: sameTarget },
	);
	let last: unknown;
	const view = computed<ResourceState<Data>>(
		() => {
			const t = riva.get(target);
			if (!t) return IDLE;
			const s = (riva.get as (d: unknown, v?: unknown) => QueryState<Data>)(
				t.def,
				t.vars,
			);
			const { data, isFetching } = s;
			if (s.status === 'error')
				return {
					status: 'error',
					data,
					error: s.error,
					isFetching,
					placeholder: false,
				};
			if (data !== undefined) {
				last = data;
				if (s.status === 'success')
					return {
						status: 'success',
						data,
						error: undefined,
						isFetching,
						placeholder: false,
					};
			} else if (keepPrevious && last !== undefined)
				return {
					status: 'success',
					data: last as Data,
					error: undefined,
					isFetching: true,
					placeholder: true,
				};
			return {
				status: 'loading',
				data,
				error: undefined,
				isFetching,
				placeholder: false,
			};
		},
		{ equals: sameState },
	);
	const o = staleTime === undefined ? {} : { staleTime };
	const watch = lazy(riva, view, target, (t, touch) =>
		riva.subscribe(t.def as Query<unknown, unknown>, t.vars, touch, o),
	);
	const load = (): Promise<Data> => {
		const t = riva.untracked(() => riva.get(target));
		return t
			? (t.def as Query<unknown, Data>).ensure(riva, t.vars, o)
			: Promise.reject(
					new RivaError(
						'RIVA_DEFINITION',
						'The resource is disabled: await it once `enabled` is true.',
					),
				);
	};
	return {
		get state() {
			return watch.read();
		},
		subscribe: watch.subscribe,
		// biome-ignore lint/suspicious/noThenProperty: a resource is awaitable on purpose
		then: (onFulfilled, onRejected) => load().then(onFulfilled, onRejected),
	};
}
