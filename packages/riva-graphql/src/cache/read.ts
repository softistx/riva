import type { EntityReader } from '@softistx/riva/entities';
import { isPlain, isRef } from '@softistx/riva/entities';
import type { FieldNode, SelectionSetNode } from 'graphql';
import { fieldKey } from './field-key';
import { collectFields, subSelections, type Walk } from './selection';
import { mergeValues, type Stored } from './values';
import type { Root } from './write';

interface Reader extends Walk {
	readonly store: EntityReader;
}

/** Marks a read that met a missing field or entity. */
const missing: unique symbol = Symbol('missing');
type Missing = typeof missing;

/**
 * Denormalizes a query's result by its selection: fragments, aliases,
 * arguments and `@skip`/`@include` applied, each entity read through its signal
 * (so the caller's computed is notified). Any field or entity missing makes
 * the whole result `undefined`, except a field only a `@defer` fragment
 * selects: it is left out until its part arrives.
 */
export function readResult(
	walk: Walk,
	store: EntityReader,
	root: Root,
): Record<string, unknown> | undefined {
	const reader: Reader = { ...walk, variables: root.vars, store };
	const data = readObject(
		reader,
		root.data,
		[walk.document.operation.selectionSet],
		true,
	);
	return data === missing ? undefined : data;
}

function readObject(
	reader: Reader,
	source: Stored,
	sets: readonly SelectionSetNode[],
	root = false,
): Record<string, unknown> | Missing {
	const typename = source['__typename'];
	const { fields, undecided, deferred } = collectFields(
		sets,
		typeof typename === 'string' ? typename : undefined,
		// The root has no `__typename`: a fragment on the root type applies.
		root ? { ...reader, matches: () => true } : reader,
		false,
	);
	const result: Record<string, unknown> = {};
	for (const [responseKey, nodes] of fields) {
		const key = fieldKey(nodes[0] as FieldNode, reader.variables);
		if (!Object.hasOwn(source, key)) {
			// A deferred field whose part has not arrived: the rest reads.
			if (deferred.has(responseKey)) continue;
			return missing;
		}
		const value = readValue(reader, source[key], subSelections(nodes));
		if (value === missing) return missing;
		result[responseKey] = value;
	}
	// A fragment on an abstract type with no possibleTypes: kept when whole.
	let out = result;
	for (const set of undecided) {
		const extra = readObject(reader, source, [set]);
		if (extra !== missing) out = mergeValues(out, extra) as typeof out;
	}
	return out;
}

function readValue(
	reader: Reader,
	value: unknown,
	sets: readonly SelectionSetNode[],
): unknown {
	if (value === null || typeof value !== 'object') return value;
	if (sets.length === 0) return value;
	if (Array.isArray(value)) {
		const items = value.map((item) => readValue(reader, item, sets));
		return items.includes(missing) ? missing : items;
	}
	if (isRef(value)) {
		const target = reader.store.fields(value.__ref);
		return target ? readObject(reader, target, sets) : missing;
	}
	return isPlain(value) ? readObject(reader, value, sets) : value;
}
