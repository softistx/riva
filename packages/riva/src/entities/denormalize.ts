import { isPlain, isRef, share } from './json';
import type { EntityStore } from './store';

/**
 * Resolves the refs of a stored value through the entity atoms: each atom read
 * is tracked, so the caller (a computed) re-runs when an entity it reached
 * changes. A missing entity is `undefined`; a ref met again inside itself is
 * cut. An entity unchanged since the last read keeps its identity.
 */
export function denormalize(store: EntityStore, v: unknown): unknown {
	return walk(store, v, new Set());
}

function walk(store: EntityStore, v: unknown, path: Set<string>): unknown {
	if (isRef(v)) {
		const ref = v['__ref'];
		const fields = store.client.get(store.atomOf(ref));
		if (!fields || path.has(ref)) return;
		path.add(ref);
		const out = walkFields(store, fields, path);
		path.delete(ref);
		const kept = share(store.last.get(ref), out);
		store.last.set(ref, kept);
		return kept;
	}
	if (Array.isArray(v)) return v.map((x) => walk(store, x, path));
	return isPlain(v) ? walkFields(store, v, path) : v;
}

function walkFields(
	store: EntityStore,
	fields: Record<string, unknown>,
	path: Set<string>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const k in fields) {
		const x = walk(store, fields[k], path);
		if (x !== undefined) out[k] = x;
	}
	return out;
}
