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

/**
 * A key function alone, the shorthand of a type: an object is of the type
 * when it returns an id (not `undefined` or `null`), so it must discriminate
 * when several types are declared.
 */
export type RestEntityKey = (obj: Fields) => string | number | undefined;

/** The entity types of an API, by name: `{ Invoice: { is, key } }`, or `{ Invoice: keyFn }`. */
export type RestEntities = Record<string, RestEntity | RestEntityKey>;

/** The full form of a type: a key function alone `k` is a type whose `is` is "`k` gives an id". */
function normalise(type: RestEntity | RestEntityKey): RestEntity {
	if (typeof type !== 'function') return type;
	return {
		is: (obj) => {
			const id = type(obj);
			return id !== undefined && id !== null;
		},
		key: type,
	};
}

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
 *   // the full form: `is` recognises the type, `key` gives its id
 *   Invoice: { is: (o) => 'number' in o, key: (o) => o['id'] as string },
 *   // the shorthand: a key function alone; an object is a Customer when it returns an id
 *   Customer: (o) => ('email' in o ? (o['id'] as string) : undefined),
 * });
 * query(api, 'get /invoices/{id}', { cache });
 * ```
 *
 * Objects a type recognises get a `__typename`, so the data a reader sees
 * carries it. The first type that matches wins (declaration order): with
 * several types, a bare `(o) => o['id']` matches every object with an id, so
 * each key function must discriminate, or use the full form. Share one
 * policy between the queries of a riva.
 */
export function restEntities(
	types: RestEntities,
	options?: Pick<EntitiesOptions, 'identify'>,
): EntityPolicy {
	const list: [string, RestEntity][] = Object.entries(types).map(
		([name, type]) => [name, normalise(type)],
	);
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
