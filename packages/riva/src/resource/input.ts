import type { Riva } from '../client';
import type { Computed } from '../computed';
import type { Duration } from '../duration';
import { RivaAbortError } from '../errors';
import type { Invalidation, Mutation } from '../mutation';
import type { Query } from '../query';
import type { Signal } from '../signal';
import { type Resource, type ResourceOptions, resource } from './resource';

/**
 * What an adapter call takes as variables or input: a plain value, a riva
 * signal or computed, or a function that reads signals (tracked: when what it
 * reads changes, the resource follows).
 */
export type TrackedInput<T> = T | Signal<T> | Computed<T> | (() => T);

/** Whether `x` is a riva signal or computed. */
export function isReactive(
	x: unknown,
): x is Signal<unknown> | Computed<unknown> {
	const kind = (x as { kind?: unknown } | null)?.kind;
	return typeof x === 'object' && (kind === 'signal' || kind === 'computed');
}

/** Resolves a `TrackedInput`; called inside a resource's tracked source. */
export function trackedInput<T>(riva: Riva, input: TrackedInput<T>): () => T {
	if (typeof input === 'function') return input as () => T;
	if (isReactive(input)) return () => riva.get(input as Signal<T>);
	return () => input as T;
}

/** A `signal` stops the wait of `await` (a `RivaAbortError`), not the shared fetch. */
export function abortable<D>(
	inner: Resource<D>,
	signal?: AbortSignal,
): Resource<D> {
	if (!signal) return inner;
	return {
		get state() {
			return inner.state;
		},
		subscribe: (l) => inner.subscribe(l),
		// biome-ignore lint/suspicious/noThenProperty: a resource is awaitable on purpose
		then: (onFulfilled, onRejected) =>
			new Promise<D>((resolve, reject) => {
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
			}).then(onFulfilled, onRejected),
	};
}

/** The options of one adapter query call (`riva.graphql.query`, `riva.rest.get`), minus its signal. */
export interface CallOptions {
	enabled?: boolean | (() => boolean);
	keepPrevious?: boolean;
	staleTime?: Duration;
}

/** The resource of one adapter query call: `def` over the tracked `read` variables, with the call's options and abort `signal`. */
export function callResource<D>(
	riva: Riva,
	def: Query<never, D>,
	read: () => unknown,
	call?: CallOptions & { signal?: AbortSignal },
): Resource<D> {
	return abortable(
		resource(
			riva,
			() => [def, read()] as never,
			(call ?? {}) as ResourceOptions,
		) as Resource<D>,
		call?.signal,
	);
}

/**
 * Runs `def` with `vars`, then marks stale what `call.invalidates` names.
 * `target` turns an entry that is not an `Invalidation` or a `Query` (a
 * document, a path) into the query it stands for, and throws on a bad one;
 * every entry is resolved first, so a bad one throws before anything was
 * written.
 */
export async function mutateInvalidating<T, D>(
	riva: Riva,
	def: Mutation<never, D>,
	vars: unknown,
	call: { invalidates?: readonly T[]; signal?: AbortSignal } | undefined,
	target: (entry: T) => Query<never, unknown> | Invalidation,
): Promise<D> {
	const stale = (call?.invalidates ?? []).map((entry) => {
		const t = target(entry);
		return 'query' in t
			? () => t.query.invalidate(riva, t.vars)
			: () => (t as Query<never, unknown>).invalidate(riva);
	});
	const data = await (def.run as (...a: unknown[]) => Promise<D>)(riva, vars, {
		signal: call?.signal,
	});
	for (const f of stale) f();
	return data;
}
