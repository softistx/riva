import type { EntityStore, Stored } from '@softistx/riva/entities';
import { fieldsOf, isPlain, isRef } from '@softistx/riva/entities';
import type { FieldNode, SelectionSetNode } from 'graphql';
import { fieldKey } from './field-key';
import { collectFields, subSelections, type Walk } from './selection';
import { mergeValues } from './values';
import type { Root } from './write';

interface Reader extends Walk {
	readonly store: EntityStore;
}

/** Marks a read that met a missing field or entity. */
const missing: unique symbol = Symbol('missing');
type Missing = typeof missing;

/**
 * Denormalizes a query's result by its selection: fragments, aliases,
 * arguments and `@skip`/`@include` applied, each entity read through its atom
 * (so the caller's computed is notified). Any field or entity missing makes
 * the whole result `undefined`.
 */
export function readResult(
	walk: Walk,
	store: EntityStore,
	root: Root,
): Record<string, unknown> | undefined {
	const reader: Reader = { ...walk, variables: root.vars, store };
	const data = readObject(reader, root.data, [
		walk.document.operation.selectionSet,
	]);
	return data === missing ? undefined : data;
}

function readObject(
	reader: Reader,
	source: Stored,
	sets: readonly SelectionSetNode[],
): Record<string, unknown> | Missing {
	const typename = source['__typename'];
	const { fields, undecided } = collectFields(
		sets,
		typeof typename === 'string' ? typename : undefined,
		reader,
		false,
	);
	const result: Record<string, unknown> = {};
	for (const [responseKey, nodes] of fields) {
		const key = fieldKey(nodes[0] as FieldNode, reader.variables);
		if (!Object.hasOwn(source, key)) return missing;
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
		const target = fieldsOf(reader.store, value.__ref);
		return target ? readObject(reader, target, sets) : missing;
	}
	return isPlain(value) ? readObject(reader, value, sets) : value;
}
