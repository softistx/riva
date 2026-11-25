import type { FieldNode, ValueNode } from 'graphql';

/** An operation's variables, its defaults applied. */
export type Variables = Readonly<Record<string, unknown>>;

/** A GraphQL value as plain JSON, its variables read from `variables` (an unset one is `undefined`). */
export function valueNode(node: ValueNode, variables: Variables): unknown {
	switch (node.kind) {
		case 'Variable':
			return variables[node.name.value];
		case 'IntValue':
		case 'FloatValue':
			return Number(node.value);
		case 'NullValue':
			return null;
		case 'ListValue':
			return node.values.map((v) => valueNode(v, variables));
		case 'ObjectValue': {
			const out: Record<string, unknown> = {};
			for (const f of node.fields)
				out[f.name.value] = valueNode(f.value, variables);
			return out;
		}
		default:
			// String, Boolean and Enum values.
			return node.value;
	}
}

/**
 * Where a field is stored: its name, and its arguments when it has any,
 * keys sorted, so `book(id: 1)` and `book(id: $id)` with `id: 1` share a key:
 * `book({"id":1})`. An alias never reaches the key.
 */
export function fieldKey(field: FieldNode, variables: Variables): string {
	const name = field.name.value;
	if (!field.arguments?.length) return name;
	const args: Record<string, unknown> = {};
	for (const argument of field.arguments) {
		const value = valueNode(argument.value, variables);
		if (value !== undefined) args[argument.name.value] = value;
	}
	if (Object.keys(args).length === 0) return name;
	return `${name}(${stableJson(args)})`;
}

/** The field's name in a field key: `book` for `book({"id":1})`. */
export function fieldNameOf(key: string): string {
	const open = key.indexOf('(');
	return open < 0 ? key : key.slice(0, open);
}

/**
 * JSON whose object keys are sorted, at every depth, written as
 * `JSON.stringify` writes it otherwise: `toJSON` is honoured (a `Date` is its
 * ISO string) and a value JSON leaves out is left out. So the key is what
 * goes on the wire. Integer-like keys keep the engine's own order.
 */
export function stableJson(value: unknown): string {
	return (
		JSON.stringify(value, (_, v) =>
			v && typeof v === 'object' && !Array.isArray(v)
				? Object.fromEntries(
						Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)),
					)
				: v,
		) ?? 'null'
	);
}
