import { RivaError } from '@softistx/riva';
import { isPlain } from '@softistx/riva/entities';

/** The fields of an entity, or of an object stored inside one, by field key. */
export type Stored = Record<string, unknown>;

/**
 * Refuses a value JSON could not hold: the cache holds JSON as the network
 * sends it (a custom scalar arrives as a string). `field` names the field
 * key the value was given for, in the error. A number must be finite, and an
 * object or array must not contain itself.
 */
export function assertJson(
	value: unknown,
	field: string,
	seen: WeakSet<object> = new WeakSet(),
): void {
	const type = typeof value;
	if (value === null || type === 'string' || type === 'boolean') return;
	if (type === 'number' && Number.isFinite(value)) return;
	const list = Array.isArray(value);
	const obj = value as { constructor: { name: string } };
	if (type === 'object' && (list || isPlain(value)) && !seen.has(value)) {
		seen.add(value);
		for (const item of list ? value : Object.values(value))
			assertJson(item, field, seen);
		// Left again: the same object twice, not nested in itself, is fine.
		seen.delete(value);
		return;
	}
	throw new RivaError(
		'RIVA_CACHE',
		`The GraphQL cache holds JSON: field ${field} holds ${
			type === 'object'
				? seen.has(obj)
					? 'a cycle'
					: obj.constructor.name
				: type === 'number'
					? value
					: type
		}.`,
	);
}

/**
 * `b` merged over `a`, without changing either: objects field by field, two
 * lists of the same length item by item; otherwise `b` wins.
 */
export function mergeValues(a: unknown, b: unknown): unknown {
	if (isPlain(a) && isPlain(b)) {
		const out: Record<string, unknown> = { ...a };
		for (const k of Object.keys(b)) out[k] = mergeValues(a[k], b[k]);
		return out;
	}
	if (Array.isArray(a) && Array.isArray(b) && a.length === b.length)
		return a.map((x, i) => mergeValues(x, b[i]));
	return b;
}
