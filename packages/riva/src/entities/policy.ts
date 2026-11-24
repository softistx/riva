import type { RivaClient } from '../client';
import type { CachePolicy } from '../query';
import { denormalize } from './denormalize';
import { type EntitiesOptions, type Fields, makeIdentify } from './identity';
import { refsIn } from './json';
import { normalize } from './normalize';
import { EntityStore } from './store';

/** What an entry stores: the normalized data and the entities it holds. */
export class EntityRoot {
	constructor(
		readonly value: unknown,
		readonly refs: string[],
	) {}
}

/** A cache policy that also tells whether an object is an entity. */
export interface EntityPolicy extends CachePolicy<EntityRoot> {
	identify(obj: Fields): string | undefined;
}

const KEY = {};

/** The entity store of a client, created on first use (the first policy's identity rules). */
export function storeOf(
	client: RivaClient,
	identify = makeIdentify(),
): EntityStore {
	let s = client.slots.get(KEY) as EntityStore | undefined;
	if (!s) {
		s = new EntityStore(client, identify);
		client.slots.set(KEY, s);
	}
	return s;
}

/** Stores query data as shared entities: `query({ cache: entities(), … })`. */
export function entities(opts?: EntitiesOptions): EntityPolicy {
	const identify = makeIdentify(opts);
	return {
		identify,
		write(client, data) {
			const store = storeOf(client, identify);
			return client.batch(() => {
				const { root, pending } = normalize(store, data);
				for (const [ref, fields] of pending) store.merge(ref, fields);
				const refs = refsIn(root);
				for (const r of refs) store.retain(r);
				return new EntityRoot(root, refs);
			});
		},
		read: (client, stored) =>
			denormalize(storeOf(client, identify), stored.value),
		release(client, stored) {
			const store = storeOf(client, identify);
			client.batch(() => {
				for (const r of stored.refs) store.release(r);
			});
		},
	};
}
