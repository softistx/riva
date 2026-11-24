import { RivaError } from './errors';

const bad = (what: string): never => {
	throw new RivaError(
		'RIVA_KEY',
		`Cannot derive a cache key: variables hold ${what}. Variables must be JSON-like (objects, arrays, strings, numbers, booleans, null, Date).`,
	);
};

function ser(v: unknown, path: unknown[]): string | undefined {
	switch (typeof v) {
		case 'undefined':
			return undefined;
		case 'string':
		case 'boolean':
			return JSON.stringify(v);
		case 'number':
			return Number.isFinite(v) ? JSON.stringify(v) : bad(`the number ${v}`);
		case 'function':
			return bad('a function');
		case 'symbol':
			return bad('a symbol');
		case 'bigint':
			return bad('a bigint');
	}
	if (v === null) return 'null';
	if (v instanceof Date)
		return Number.isNaN(v.getTime())
			? bad('an invalid Date')
			: JSON.stringify(v.toISOString());
	if (path.includes(v)) return bad('a circular reference');
	path.push(v);
	let out: string;
	if (Array.isArray(v))
		out = `[${v.map((x) => ser(x, path) ?? 'null').join(',')}]`;
	else {
		const parts: string[] = [];
		for (const k of Object.keys(v as object).sort()) {
			const s = ser((v as Record<string, unknown>)[k], path);
			if (s !== undefined) parts.push(`${JSON.stringify(k)}:${s}`);
		}
		out = `{${parts.join(',')}}`;
	}
	path.pop();
	return out;
}

/** The cache key of a definition id and its variables: stable whatever the order of object keys. */
export const stableKey = (id: string, vars: unknown): string =>
	`${id}:${ser(vars, []) ?? ''}`;
