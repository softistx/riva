/** A reference to an entity, as stored in place of it. */
export interface Ref {
	// biome-ignore lint/style/useNamingConvention: the wire name of a reference
	__ref: string;
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null;

/** A plain object: a literal, or one with no prototype. */
export const isPlain = (v: unknown): v is Record<string, unknown> => {
	if (!isObject(v) || Array.isArray(v)) return false;
	const proto = Object.getPrototypeOf(v);
	return proto === Object.prototype || proto === null;
};

export const isRef = (v: unknown): v is Ref =>
	isPlain(v) && typeof v['__ref'] === 'string';

/** Deep equality over JSON data and dates. */
export function equal(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (a instanceof Date) return b instanceof Date && +a === +b;
	if (!isObject(a) || !isObject(b)) return false;
	if (Array.isArray(a)) {
		return (
			Array.isArray(b) &&
			a.length === b.length &&
			a.every((x, i) => equal(x, b[i]))
		);
	}
	if (Array.isArray(b) || a instanceof Date || b instanceof Date) return false;
	const ka = Object.keys(a);
	return (
		ka.length === Object.keys(b).length &&
		ka.every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]))
	);
}

/** Keeps `prev`'s identity (and its parts') wherever `next` equals it. */
export function share(prev: unknown, next: unknown): unknown {
	if (prev === next || !isObject(prev) || !isObject(next)) return next;
	if (prev instanceof Date || next instanceof Date)
		return equal(prev, next) ? prev : next;
	if (Array.isArray(prev) || Array.isArray(next)) {
		if (!Array.isArray(prev) || !Array.isArray(next)) return next;
		const out = next.map((x, i) => share(prev[i], x));
		return out.length === prev.length && out.every((x, i) => x === prev[i])
			? prev
			: out;
	}
	const n = next as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	const keys = Object.keys(n);
	for (const k of keys) out[k] = share(prev[k], n[k]);
	return keys.length === Object.keys(prev).length &&
		keys.every((k) => Object.hasOwn(prev, k) && out[k] === prev[k])
		? prev
		: out;
}

/** The entity refs inside a normalized value (duplicates kept). */
export function refsIn(v: unknown, out: string[] = []): string[] {
	if (isRef(v)) out.push(v['__ref']);
	else if (Array.isArray(v)) for (const x of v) refsIn(x, out);
	else if (isPlain(v)) for (const k in v) refsIn(v[k], out);
	return out;
}
