import type { RivaClient } from '../client';
import { denormalize } from './denormalize';
import type { Fields } from './identity';
import { refsIn } from './json';
import { normalizeAt } from './normalize';
import { type EntityPolicy, EntityRoot, storeOf } from './policy';

/** The entity as the queries read it (tracked inside a computed or effect); `undefined` when missing. */
export const readEntity = <T = Record<string, unknown>>(
	client: RivaClient,
	ref: string,
): T | undefined => {
	const store = storeOf(client);
	return denormalize(store, { __ref: ref }, store.directLocal) as T | undefined;
};

/**
 * Merges a patch into an entity (created when missing), or the object a
 * function returns from its current value; every query reading it is
 * notified once.
 */
export function writeEntity<T extends Fields = Fields>(
	client: RivaClient,
	ref: string,
	patch: T | ((prev: Record<string, unknown> | undefined) => T),
): void {
	const store = storeOf(client);
	const next =
		typeof patch === 'function'
			? patch(client.untracked(() => readEntity(client, ref)))
			: patch;
	const pending = normalizeAt(store, ref, next);
	client.batch(() => {
		for (const [r, fields] of pending) store.merge(r, fields);
		store.pins.add(ref);
	});
}

/** Removes an entity: queries reading it see the field as missing. `false` when absent. */
export function evict(client: RivaClient, ref: string): boolean {
	const store = storeOf(client);
	store.pins.delete(ref);
	return store.clear(ref);
}

/** Marks stale every query entry that reaches the entity, and refetches the observed ones. */
export function invalidateEntity(client: RivaClient, ref: string): void {
	const store = storeOf(client);
	client.queries.invalidateBy((stored) => {
		if (!(stored instanceof EntityRoot)) return false;
		const seen = new Set<string>();
		const todo = [...stored.refs];
		for (let r = todo.pop(); r !== undefined; r = todo.pop()) {
			if (r === ref) return true;
			if (seen.has(r)) continue;
			seen.add(r);
			const fields = store.peek(r);
			for (const k in fields) todo.push(...refsIn(fields[k]));
		}
		return false;
	});
}

/** The ref (`Type:id`) the policy gives an object, or `undefined` when it is not an entity. */
export const identifyOf = (
	policy: EntityPolicy,
	obj: Fields,
): string | undefined => policy.identify(obj);
