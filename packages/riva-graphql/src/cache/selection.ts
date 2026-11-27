import { RivaError } from '@softistx/riva';
import type {
	DocumentNode,
	FieldNode,
	FragmentDefinitionNode,
	OperationDefinitionNode,
	SelectionNode,
	SelectionSetNode,
} from 'graphql';
import { type Variables, valueNode } from './field-key';
import type { TypeMatcher } from './type-match';

/** A document as the cache walks it: its operation and its fragments by name. */
export interface CacheDocument {
	readonly operation: OperationDefinitionNode;
	readonly fragments: ReadonlyMap<string, FragmentDefinitionNode>;
}

/** One walk of a document: the variables, defaults applied, and the type matcher. */
export interface Walk {
	readonly document: CacheDocument;
	readonly variables: Variables;
	readonly matches: TypeMatcher;
}

/** The fields to visit on one object, by response key (alias or name). */
export interface Collected {
	readonly fields: Map<string, FieldNode[]>;
	/** Fragments whose type condition could not be decided: read only when whole. */
	readonly undecided: SelectionSetNode[];
	/** Response keys selected only inside a `@defer` fragment: absent until their part arrives. */
	readonly deferred: Set<string>;
}

/** The operation and fragments of a document; throws a `RivaError` (`RIVA_DEFINITION`) when it holds no operation. */
export function cacheDocumentOf(node: DocumentNode): CacheDocument {
	let operation: OperationDefinitionNode | undefined;
	const fragments = new Map<string, FragmentDefinitionNode>();
	for (const definition of node.definitions) {
		if (definition.kind === 'OperationDefinition') operation ??= definition;
		else if (definition.kind === 'FragmentDefinition')
			fragments.set(definition.name.value, definition);
	}
	if (!operation)
		throw new RivaError(
			'RIVA_DEFINITION',
			'riva-graphql: the document holds no operation; query it with one named operation.',
		);
	return { operation, fragments };
}

/** The variables given, each one left out taking its declared default. */
export function variablesOf(
	operation: OperationDefinitionNode,
	given: unknown,
): Variables {
	const variables: Record<string, unknown> = {
		...(given as Record<string, unknown> | undefined),
	};
	for (const definition of operation.variableDefinitions ?? []) {
		const name = definition.variable.name.value;
		if (variables[name] === undefined && definition.defaultValue)
			variables[name] = valueNode(definition.defaultValue, {});
	}
	return variables;
}

/**
 * The fields the selection sets ask of an object of `typename`: `@skip`
 * and `@include` applied, fragments matched, same response keys grouped.
 * With `undecidedApply`, an undecided fragment's fields join the others.
 */
export function collectFields(
	sets: readonly SelectionSetNode[],
	typename: string | undefined,
	walk: Walk,
	undecidedApply: boolean,
): Collected {
	const collected: Collected = {
		fields: new Map(),
		undecided: [],
		deferred: new Set(),
	};
	const seenPlain = new Set<string>();
	const seen = new Set<string>();
	const visit = (set: SelectionSetNode, lazy: boolean) => {
		for (const selection of set.selections) {
			if (!included(selection, walk.variables)) continue;
			if (selection.kind === 'Field') {
				const key = selection.alias?.value ?? selection.name.value;
				if (!lazy) {
					seenPlain.add(key);
					collected.deferred.delete(key);
				} else if (!seenPlain.has(key)) collected.deferred.add(key);
				const group = collected.fields.get(key);
				if (group) group.push(selection);
				else collected.fields.set(key, [selection]);
				continue;
			}
			const fragment = fragmentOf(selection, walk, seen);
			if (!fragment) continue;
			const match = walk.matches(fragment.condition, typename);
			const part = lazy || deferring(selection, walk.variables);
			if (match || (match === undefined && undecidedApply))
				visit(fragment.set, part);
			else if (match === undefined) collected.undecided.push(fragment.set);
		}
	};
	for (const set of sets) visit(set, false);
	return collected;
}

/** The sub-selections of fields grouped under one response key. */
export function subSelections(
	fields: readonly FieldNode[],
): SelectionSetNode[] {
	return fields.flatMap((field) =>
		field.selectionSet ? [field.selectionSet] : [],
	);
}

function fragmentOf(
	selection: Exclude<SelectionNode, FieldNode>,
	walk: Walk,
	seen: Set<string>,
): { condition: string | undefined; set: SelectionSetNode } | undefined {
	if (selection.kind === 'InlineFragment')
		return {
			condition: selection.typeCondition?.name.value,
			set: selection.selectionSet,
		};
	const name = selection.name.value;
	if (seen.has(name)) return undefined;
	seen.add(name);
	const definition = walk.document.fragments.get(name);
	if (!definition)
		throw new RivaError(
			'RIVA_DEFINITION',
			`riva-graphql: the document uses the fragment ${name} but does not define it; include its definition in the document.`,
		);
	return {
		condition: definition.typeCondition.name.value,
		set: definition.selectionSet,
	};
}

/** A fragment with `@defer` (a literal or variable `if: false` switches it off). */
function deferring(
	selection: Exclude<SelectionNode, FieldNode>,
	variables: Variables,
): boolean {
	const directive = selection.directives?.find((d) => d.name.value === 'defer');
	if (!directive) return false;
	const argument = directive.arguments?.find((a) => a.name.value === 'if');
	return !argument || valueNode(argument.value, variables) !== false;
}

/** `@skip(if:)` and `@include(if:)`, read from the variables. */
function included(selection: SelectionNode, variables: Variables): boolean {
	for (const directive of selection.directives ?? []) {
		const name = directive.name.value;
		if (name !== 'skip' && name !== 'include') continue;
		const argument = directive.arguments?.find((a) => a.name.value === 'if');
		const value = argument ? valueNode(argument.value, variables) : undefined;
		if (name === 'skip' && value === true) return false;
		if (name === 'include' && value !== true) return false;
	}
	return true;
}
