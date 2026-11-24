import type {
	DocumentNode,
	FragmentDefinitionNode,
	SelectionSetNode,
} from 'graphql';

const missing = (field: string) =>
	`riva-graphql: the field "${field}" selects no __typename, which the cache needs to identify objects: add the client preset's addTypenameSelectionDocumentTransform to its documentTransforms.`;

/**
 * Throws a `TypeError` when an object of the document cannot be identified:
 * a selection set below the operation's own that selects no `__typename`,
 * directly or through an inline fragment with no type condition (a type
 * condition or a fragment spread covers one branch only). The document
 * is never rewritten, since a persisted id is the hash of its text.
 */
export function assertTypename(node: DocumentNode): void {
	const fragments = new Map<string, FragmentDefinitionNode>();
	for (const d of node.definitions)
		if (d.kind === 'FragmentDefinition') fragments.set(d.name.value, d);

	// Selected directly, or in an inline fragment with no type condition: a
	// branch of a union or a named fragment selecting it covers only its type.
	const has = (set: SelectionSetNode): boolean =>
		set.selections.some((s) =>
			s.kind === 'Field'
				? s.name.value === '__typename'
				: s.kind === 'InlineFragment' &&
					!s.typeCondition &&
					has(s.selectionSet),
		);

	const check = (set: SelectionSetNode, seen: Set<string>): void => {
		for (const s of set.selections) {
			if (s.kind === 'Field') {
				if (s.selectionSet && !has(s.selectionSet))
					throw new TypeError(missing(s.name.value));
				if (s.selectionSet) check(s.selectionSet, seen);
			} else if (s.kind === 'InlineFragment') check(s.selectionSet, seen);
			else {
				const f = fragments.get(s.name.value);
				if (f && !seen.has(f.name.value)) {
					seen.add(f.name.value);
					check(f.selectionSet, seen);
				}
			}
		}
	};
	for (const d of node.definitions)
		if (d.kind === 'OperationDefinition') check(d.selectionSet, new Set());
}
