import { RivaError } from '@softistx/riva';
import type { EntityReader, Fields, Normalized } from '@softistx/riva/entities';
import { isPlain, isRef } from '@softistx/riva/entities';
import type { FieldNode, SelectionSetNode } from 'graphql';
import { fieldKey } from './field-key';
import { collectFields, subSelections, type Walk } from './selection';
import { assertJson, type Stored } from './values';

interface Writer extends Walk {
	readonly store: EntityReader;
	/** The fields to merge, by entity, once the whole walk succeeded. */
	readonly pending: Map<string, Stored>;
}

/** What a query entry stores: the variables and the root fields by field key. */
export interface Root {
	readonly vars: Fields;
	readonly data: Stored;
}

/**
 * Normalizes an operation's data: each object with an identity becomes an
 * entity, its fields set by field key (arguments in the key, aliases not);
 * the others are stored inside their parent. A query keeps its root fields
 * in its own `root`; a mutation keeps none (its arguments may hold secrets),
 * only the entities it returns. Nothing is merged here: `pending` holds the
 * entities' fields, so a write that throws halfway changes nothing.
 */
export function writeResult(
	walk: Walk,
	store: EntityReader,
	data: unknown,
): Normalized {
	if (!isPlain(data))
		throw new RivaError(
			'RIVA_CACHE',
			"The GraphQL cache stores an operation's data: an object.",
		);
	const writer: Writer = { ...walk, store, pending: new Map() };
	const { operation } = walk.document;
	const { fields } = collectFields(
		[operation.selectionSet],
		undefined,
		// The root has no `__typename`: a fragment on the root type applies.
		{ ...walk, matches: () => true },
		true,
	);
	const entries = writeFields(writer, data, fields, undefined);
	const root: Root | undefined =
		operation.operation === 'query'
			? { vars: walk.variables, data: entries }
			: undefined;
	return { root, pending: writer.pending };
}

function writeObject(
	writer: Writer,
	data: Record<string, unknown>,
	sets: readonly SelectionSetNode[],
	existing: unknown,
): unknown {
	const typename = data['__typename'];
	const { fields } = collectFields(
		sets,
		typeof typename === 'string' ? typename : undefined,
		writer,
		true,
	);
	const ref = writer.store.identify(byName(data, fields));
	if (ref) {
		const held = { ...writer.store.peek(ref), ...writer.pending.get(ref) };
		const entries = writeFields(writer, data, fields, held);
		writer.pending.set(ref, { ...writer.pending.get(ref), ...entries });
		return { __ref: ref };
	}
	// Embedded: merged over what the same field held for the same type, so
	// two queries selecting different fields of it both stay whole.
	const previous =
		isPlain(existing) && !isRef(existing) && existing['__typename'] === typename
			? existing
			: undefined;
	const entries = writeFields(writer, data, fields, previous);
	return previous ? { ...previous, ...entries } : entries;
}

function writeFields(
	writer: Writer,
	data: Record<string, unknown>,
	fields: ReadonlyMap<string, FieldNode[]>,
	previous: Stored | undefined,
): Stored {
	const entries: Stored = {};
	for (const [responseKey, nodes] of fields) {
		if (!Object.hasOwn(data, responseKey)) continue;
		const key = fieldKey(nodes[0] as FieldNode, writer.variables);
		// The same field under two aliases: the second walk merges over the first.
		entries[key] = writeValue(
			writer,
			data[responseKey],
			key,
			subSelections(nodes),
			Object.hasOwn(entries, key) ? entries[key] : previous?.[key],
		);
	}
	return entries;
}

/** `field` is the field key the value is written under, for a refusal's message. */
function writeValue(
	writer: Writer,
	value: unknown,
	field: string,
	sets: readonly SelectionSetNode[],
	existing: unknown,
): unknown {
	if (value === undefined || value === null) return null;
	// A leaf: a scalar's value, a JSON one included, kept as it came.
	if (sets.length === 0) {
		assertJson(value, field);
		return value;
	}
	if (Array.isArray(value))
		return value.map((item, i) =>
			writeValue(
				writer,
				item,
				field,
				sets,
				// Lists of one length are read item by item: two queries selecting
				// other fields of the items both stay whole.
				Array.isArray(existing) && existing.length === value.length
					? existing[i]
					: undefined,
			),
		);
	if (!isPlain(value)) {
		assertJson(value, field);
		return value;
	}
	return writeObject(writer, value, sets, existing);
}

/** The object's argument-less fields by their names, aliases resolved: what the identity reads. */
function byName(
	data: Record<string, unknown>,
	fields: ReadonlyMap<string, FieldNode[]>,
): Record<string, unknown> {
	const named: Record<string, unknown> = {};
	for (const [responseKey, [node]] of fields) {
		if (!node || node.arguments?.length || !Object.hasOwn(data, responseKey))
			continue;
		const name = node.name.value;
		if (!Object.hasOwn(named, name)) named[name] = data[responseKey];
	}
	return named;
}
