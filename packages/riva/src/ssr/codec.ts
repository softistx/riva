import { RivaError } from '../errors';

/** The error of every refused snapshot. */
export const ssrError = (message: string): RivaError =>
	new RivaError('RIVA_SSR', message);

const refuse = (what: string, path: string): never => {
	throw ssrError(
		`Cannot dehydrate ${what} at ${path}: snapshots hold JSON values and Dates. Convert it in the fetch, or keep it out of the cache.`,
	);
};

const mapObject = (o: object, f: (v: unknown, k: string) => unknown) =>
	Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v, k)]));

/** `encode` with the path shown in a refusal's message. */
export function encodeAt(
	value: unknown,
	path = '$',
	seen: object[] = [],
): unknown {
	const type = typeof value;
	if (type === 'bigint' || type === 'function' || type === 'symbol')
		return refuse(`a ${type}`, path);
	if (type === 'number')
		return Number.isFinite(value) ? value : { $t: 'N', v: String(value) };
	if (type !== 'object' || value === null) return value;
	const obj = value as object;
	if (seen.includes(obj)) return refuse('a cycle', path);
	if (obj instanceof Date) return { $t: 'D', v: obj.toISOString() };
	const k = obj.constructor as { name: string } | undefined;
	const list = Array.isArray(obj);
	if (!list && k && k !== Object) return refuse(`a ${k.name} instance`, path);
	seen.push(obj);
	const out = list
		? obj.map((x, i) => encodeAt(x, `${path}[${i}]`, seen))
		: mapObject(obj, (v, k) => encodeAt(v, `${path}.${k}`, seen));
	seen.pop();
	return '$t' in obj ? { $t: 'O', v: out } : out;
}

/** A JSON-safe copy of `value`: Dates and non-finite numbers are tagged, `$t` keys escaped. */
export const encode: (value: unknown) => unknown = encodeAt;

/** The inverse of `encode`. */
export function decode(value: unknown): unknown {
	if (typeof value !== 'object' || value === null) return value;
	if (Array.isArray(value)) return value.map(decode);
	// biome-ignore lint/style/useNamingConvention: the tag key of the wire format
	const { $t: tag, v } = value as { $t?: unknown; v?: unknown };
	return tag === 'D'
		? new Date(v as string)
		: tag === 'N'
			? Number(v)
			: mapObject((tag === 'O' ? v : value) as object, decode);
}
