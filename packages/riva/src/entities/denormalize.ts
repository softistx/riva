import { isPlain, isRef, share } from './json';
import type { EntityStore } from './store';

/**
 * Resolves the refs of a stored value through the entity signals: each signal read
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

/** The fields of an entity as a reader sees them: tracked, with the optimistic layers over them. */
export function fieldsOf(store: EntityStore, ref: string) {
	const a = store.signals.get(ref);
	// A missing entity is only given a signal when the read is tracked.
	let fields = a
		? store.riva.get(a)
		: store.riva.graph.track
			? store.riva.get(store.signalOf(ref))
			: undefined;
	for (const layer of store.skip ? [] : store.riva.get(store.ov)) {
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
		// A GraphQL argument field (`friends({"first":1})`) is not part of a plain result.
		if (k.includes('(')) continue;
		const x = walk(store, fields[k], c);
		if (x !== undefined) out[k] = x;
	}
	return out;
}
