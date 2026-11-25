import {
	type EntitiesOptions,
	type EntityPolicy,
	entities,
	type Fields,
	isPlain,
} from '@softistx/riva/entities';

/** How one REST resource becomes an entity. */
export interface RestEntity {
	/** Whether an object of the response is one (a shape check: `'invoiceNo' in o`). */
	is(obj: Fields): boolean;
	/** Its id; `undefined` leaves the object a plain value. */
	key(obj: Fields): string | number | undefined;
}

/** The entity types of an API, by name: `{ Invoice: { is, key } }`. */
export type RestEntities = Record<string, RestEntity>;

/** Tags every object `types` recognises with its `__typename`, on a copy: the response is never mutated. */
function tag(types: [string, RestEntity][], value: unknown): unknown {
	if (Array.isArray(value)) return value.map((item) => tag(types, item));
	if (!isPlain(value)) return value;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value)) out[k] = tag(types, v);
	if (typeof out['__typename'] === 'string') return out;
	const hit = types.find(([, e]) => e.is(value));
	return hit ? { ...out, __typename: hit[0] } : out;
}

/**
 * A cache policy that stores the REST resources you declare as shared
 * entities, so a refetch of one query updates the others and a mutation's
 * result reaches every query that shows it:
 *
 * ```ts
 * const cache = restEntities({
 *   Invoice: { is: (o) => 'number' in o, key: (o) => o['id'] as string },
 * });
 * query(api, 'get /invoices/{id}', { cache });
 * ```
 *
 * Objects `is` recognises get a `__typename`, so the data a reader sees
 * carries it. Share one policy between the queries of a riva.
 */
export function restEntities(
	types: RestEntities,
	options?: Pick<EntitiesOptions, 'identify'>,
): EntityPolicy {
	const list = Object.entries(types);
	const policy = entities({
		...options,
		keys: Object.fromEntries(list.map(([name, e]) => [name, e.key])),
	});
	const inner = policy as Required<EntityPolicy>;
	return {
		...policy,
		write: (riva, data, prev, vars) =>
			policy.write(riva, tag(list, data), prev, vars),
		layer: (riva, data, vars) => inner.layer(riva, tag(list, data), vars),
		commit: (riva, data, vars) => inner.commit(riva, tag(list, data), vars),
	};
}
