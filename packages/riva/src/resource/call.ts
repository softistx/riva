import type { Riva } from '../client';
import type { Duration } from '../duration';
import type { Invalidation, Mutation } from '../mutation';
import type { Query } from '../query';
import { abortable } from './abortable';
import { type Resource, type ResourceOptions, resource } from './resource';

/** The options of one adapter query call (`riva.graphql.query`, `riva.rest.get`), minus its signal. */
export interface CallOptions {
	enabled?: boolean | (() => boolean);
	keepPrevious?: boolean;
	staleTime?: Duration;
}

/** The resource of one adapter query call: `def` over the tracked `read` variables, with the call's options and abort `signal`. */
export function callResource<V, D>(
	riva: Riva,
	def: Query<V, D>,
	read: () => V,
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
export async function mutateInvalidating<T, V, D>(
	riva: Riva,
	def: Mutation<V, D>,
	vars: V,
	call: { invalidates?: readonly T[]; signal?: AbortSignal } | undefined,
	target: (entry: T) => Invalidation,
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
