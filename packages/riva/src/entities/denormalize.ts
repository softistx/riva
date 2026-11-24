import { isPlain, isRef, share } from './json';
import type { EntityStore } from './store';

/**
 * Resolves the refs of a stored value through the entity atoms: each atom read
 * is tracked, so the caller (a computed) re-runs when an entity it reached
 * changes. A missing entity is `undefined`; a ref met again inside itself is
 * cut. An entity unchanged since the last read keeps its identity: its last
 * value is in the store's shared memo, or, when a cut shaped it (it then
 * depends on where the read started), in the reader's own `local` memo.
 */
export function denormalize(
	store: EntityStore,
	v: unknown,
	local: Map<string, unknown>,
): unknown {
	return walk(store, v, { path: new Set(), cuts: 0, local });
}

interface Ctx {
	path: Set<string>;
	cuts: number;
	local: Map<string, unknown>;
}

function fieldsOf(store: EntityStore, ref: string) {
	const a = store.atoms.get(ref);
	// A missing entity is only given an atom when the read is tracked.
	let fields = a
		? store.client.get(a)
		: store.client.graph.track
			? store.client.get(store.atomOf(ref))
			: undefined;
	for (const layer of store.skip ? [] : store.client.get(store.ov)) {
		const patch = layer.get(ref);
		if (patch) fields = { ...fields, ...patch };
	}
	return fields;
}

function walk(store: EntityStore, v: unknown, c: Ctx): unknown {
	if (isRef(v)) {
		const ref = v['__ref'];
		const fields = fieldsOf(store, ref);
		if (!fields) return;
		if (c.path.has(ref)) {
			c.cuts++;
			return;
		}
		const cuts = c.cuts;
		c.path.add(ref);
		const out = walkFields(store, fields, c);
		c.path.delete(ref);
		const memo = c.cuts === cuts ? store.direct : c.local;
		const kept = share(memo.get(ref), out);
		memo.set(ref, kept);
		return kept;
	}
	if (Array.isArray(v)) return v.map((x) => walk(store, x, c));
	return isPlain(v) ? walkFields(store, v, c) : v;
}

function walkFields(
	store: EntityStore,
	fields: Record<string, unknown>,
	c: Ctx,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const k in fields) {
		const x = walk(store, fields[k], c);
		if (x !== undefined) out[k] = x;
	}
	return out;
}
