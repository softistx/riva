export type Fields = Readonly<Record<string, unknown>>;
export type Identify = (obj: Fields) => string | undefined;

export interface EntitiesOptions {
	/** Identity of a type, by `__typename`: a string or number, or `undefined` for none. */
	keys?: Record<string, (obj: Fields) => string | number | undefined>;
	/** Replaces the default identity: return the ref (`Type:id`), or `undefined` for a non-entity. */
	identify?: Identify;
}

/** `Type:id` for an object with a string `__typename` and an `id` (or `_id`), or a `keys` entry. */
export function makeIdentify(opts: EntitiesOptions = {}): Identify {
	if (opts.identify) return opts.identify;
	const keys = opts.keys;
	return (obj) => {
		const type = obj['__typename'];
		if (typeof type !== 'string') return;
		const custom = keys && Object.hasOwn(keys, type) ? keys[type] : undefined;
		const id = custom ? custom(obj) : (obj['id'] ?? obj['_id']);
		return typeof id === 'string' || typeof id === 'number'
			? `${type}:${id}`
			: undefined;
	};
}
