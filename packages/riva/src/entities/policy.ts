import type { RivaClient } from '../client';
import { RivaError } from '../errors';
import type { CachePolicy } from '../query';
import { denormalize } from './denormalize';
import { type EntitiesOptions, type Fields, makeIdentify } from './identity';
import { refsIn, share } from './json';
import { type Normalized, normalize } from './normalize';
import { EntityStore } from './store';

/** What an entry stores: the normalized data and the entities it holds. */
export class EntityRoot {
	/** What a reader last saw, to keep identities between reads. */
	memo = new Map<string, unknown>();
	seen: unknown;
	constructor(
		readonly value: unknown,
		readonly refs: string[],
	) {}
}

/** A cache policy that also tells whether an object is an entity. */
export interface EntityPolicy extends CachePolicy<EntityRoot> {
	identify(obj: Fields): string | undefined;
}

/**
 * How data becomes entities and back, for a policy that knows the shape of the
 * data (a GraphQL selection). `denormalize` runs in a computed: read each
 * entity through `fieldsOf`, so what it reads is tracked.
 */
export interface EntityCodec {
	/** `vars` are the variables of the query or mutation that gave `data`. */
	normalize(store: EntityStore, data: unknown, vars: unknown): Normalized;
	denormalize(
		store: EntityStore,
		root: unknown,
		local: Map<string, unknown>,
	): unknown;
}

const plain: EntityCodec = { normalize, denormalize };

const KEY = {};

/** The entity store of a client, created on first use. */
export function storeOf(client: RivaClient): EntityStore {
	let s = client.slots.get(KEY) as EntityStore | undefined;
	if (!s) {
		s = new EntityStore(client);
		client.slots.set(KEY, s);
	}
	return s;
}

/**
 * The client's store, bound to the identity rules of `opts`. The first policy
 * binds it (an unbound store only while it is empty, unless the rules are the
 * default ones); a policy with other rules is refused.
 */
function bound(
	client: RivaClient,
	opts: EntitiesOptions | undefined,
	identify: EntityStore['identify'],
): EntityStore {
	const store = storeOf(client);
	const rules = { keys: opts?.keys, identify: opts?.identify };
	if (store.rules) {
		if (
			store.rules.keys !== rules.keys ||
			store.rules.identify !== rules.identify
		)
			throw new RivaError(
				'RIVA_CACHE',
				'This client already uses other entity identity rules. Share one entities() (or the same options objects) between its queries.',
			);
	} else if (rules.keys || rules.identify) {
		if (!store.empty)
			throw new RivaError(
				'RIVA_CACHE',
				'This client already uses other entity identity rules. Create its entities() policy before its first readEntity or writeEntity.',
			);
		store.rules = rules;
		store.identify = identify;
	} else store.rules = rules;
	return store;
}

/** Stores query data as shared entities: `query({ cache: entities(), … })`. */
export function entities(
	opts?: EntitiesOptions,
	codec: EntityCodec = plain,
): EntityPolicy {
	const identify = makeIdentify(opts);
	return {
		identify,
		write(client, data, prev, vars) {
			const store = bound(client, opts, identify);
			return client.batch(() => {
				const { root, pending } = codec.normalize(store, data, vars);
				for (const [ref, fields] of pending) store.merge(ref, fields);
				const stored = new EntityRoot(root, refsIn(root));
				if (prev) {
					stored.memo = prev.memo;
					stored.seen = prev.seen;
				}
				store.roots.add(stored);
				return stored;
			});
		},
		read(client, stored, committed) {
			const store = bound(client, opts, identify);
			store.skip = !!committed;
			try {
				const seen = share(
					stored.seen,
					codec.denormalize(store, stored.value, stored.memo),
				);
				if (!committed) stored.seen = seen;
				return seen;
			} finally {
				store.skip = false;
			}
		},
		layer(client, data, vars) {
			const { pending } = codec.normalize(
				bound(client, opts, identify),
				data,
				vars,
			);
			client.set(storeOf(client).ov, (ls) => [...ls, pending]);
			return {
				drop: () =>
					client.set(storeOf(client).ov, (ls) =>
						ls.filter((l) => l !== pending),
					),
			};
		},
		commit(client, data, vars) {
			const store = bound(client, opts, identify);
			const { pending } = codec.normalize(store, data, vars);
			client.batch(() => {
				for (const [ref, fields] of pending) store.merge(ref, fields);
			});
		},
		release(client, stored) {
			const store = bound(client, opts, identify);
			store.roots.delete(stored);
			store.sweep();
		},
	};
}
