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
 * directly or through an inline fragment or a fragment spread. The document
 * is never rewritten, since a persisted id is the hash of its text.
 */
export function assertTypename(node: DocumentNode): void {
	const fragments = new Map<string, FragmentDefinitionNode>();
	for (const d of node.definitions)
		if (d.kind === 'FragmentDefinition') fragments.set(d.name.value, d);

	const has = (set: SelectionSetNode, seen: Set<string>): boolean =>
		set.selections.some((s) => {
			if (s.kind === 'Field') return s.name.value === '__typename';
			if (s.kind === 'InlineFragment') return has(s.selectionSet, seen);
			const f = fragments.get(s.name.value);
			if (!f || seen.has(f.name.value)) return false;
			seen.add(f.name.value);
			return has(f.selectionSet, seen);
		});

	const check = (set: SelectionSetNode, seen: Set<string>): void => {
		for (const s of set.selections) {
			if (s.kind === 'Field') {
				if (s.selectionSet && !has(s.selectionSet, new Set()))
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
