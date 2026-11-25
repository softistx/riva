import { RivaError } from './errors';

const bad = (what: string): never => {
	throw new RivaError(
		'RIVA_KEY',
		`Cannot derive a cache key: variables hold ${what}. Use JSON-like values.`,
	);
};

function ser(v: unknown, path: unknown[]): string | undefined {
	if (v === undefined) return;
	if (v instanceof Date)
		v = Number.isNaN(+v) ? bad('an invalid Date') : v.toISOString();
	if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint')
		bad(`a ${typeof v}`);
	if (typeof v === 'number' && !Number.isFinite(v)) bad(`the number ${v}`);
	if (!v || typeof v !== 'object') return JSON.stringify(v);
	if (path.includes(v)) bad('a circular reference');
	path.push(v);
	const out = Array.isArray(v)
		? `[${v.map((x) => ser(x, path) ?? 'null')}]`
		: `{${Object.keys(v)
				.sort()
				.flatMap((k) => {
					const s = ser((v as Record<string, unknown>)[k], path);
					return s === undefined ? [] : `${JSON.stringify(k)}:${s}`;
				})}}`;
	path.pop();
	return out;
}

/** The cache key of a definition id and its variables: stable whatever the order of object keys. */
export const stableKey = (id: string, vars: unknown): string =>
	`${id}:${ser(vars, []) ?? ''}`;
