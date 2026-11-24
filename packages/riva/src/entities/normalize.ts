import { RivaError } from '../errors';
import type { Fields } from './identity';
import { isPlain, type Ref } from './json';
import type { EntityStore, Stored } from './store';

const bad = (what: string): never => {
	throw new RivaError(
		'RIVA_CACHE',
		`Cannot cache the data: it holds ${what}. Use JSON-like values (a Date is allowed).`,
	);
};

export interface Normalized {
	/** The data with each entity replaced by its ref. */
	root: unknown;
	/** The fields to merge, by entity; nothing is merged until the whole walk succeeded. */
	pending: Map<string, Stored>;
}

function fieldsOf(
	store: EntityStore,
	obj: Record<string, unknown>,
	pending: Map<string, Stored>,
	path: unknown[],
): Stored {
	const fields: Stored = {};
	for (const k of Object.keys(obj)) {
		const n = walk(store, obj[k], pending, path);
		if (n !== undefined) fields[k] = n;
	}
	return fields;
}

function walk(
	store: EntityStore,
	v: unknown,
	pending: Map<string, Stored>,
	path: unknown[],
): unknown {
	if (v === undefined || v === null) return v;
	const type = typeof v;
	if (type === 'function' || type === 'symbol' || type === 'bigint')
		bad(`a ${type}`);
	if (type !== 'object') {
		if (type === 'number' && !Number.isFinite(v)) bad(`the number ${v}`);
		return v;
	}
	if (v instanceof Date) return v;
	if (!Array.isArray(v) && !isPlain(v))
		return bad(
			`an instance of ${(v as object).constructor?.name ?? 'a class'}`,
		);
	if (path.includes(v)) bad('a circular reference');
	path.push(v);
	let out: unknown;
	if (Array.isArray(v))
		out = v.map((x) => walk(store, x, pending, path) ?? null);
	else {
		const fields = fieldsOf(store, v, pending, path);
		const ref = store.identify(v as Fields);
		if (ref === undefined) out = fields;
		else {
			pending.set(ref, { ...pending.get(ref), ...fields });
			out = { __ref: ref } satisfies Ref;
		}
	}
	path.pop();
	return out;
}

export function normalize(store: EntityStore, data: unknown): Normalized {
	const pending = new Map<string, Stored>();
	return { root: walk(store, data, pending, []), pending };
}

/** The fields of `obj` merged into the entity `ref` (nested entities are normalized too). */
export function normalizeAt(
	store: EntityStore,
	ref: string,
	obj: unknown,
): Map<string, Stored> {
	if (!isPlain(obj)) bad('something other than an object for an entity');
	const pending = new Map<string, Stored>();
	pending.set(
		ref,
		fieldsOf(store, obj as Record<string, unknown>, pending, []),
	);
	return pending;
}
