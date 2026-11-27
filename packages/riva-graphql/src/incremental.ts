import { BREAK, type DirectiveNode, type DocumentNode, visit } from 'graphql';

/** A literal `if: false` switches `@defer` and `@stream` off. */
const off = (directive: DirectiveNode): boolean =>
	directive.arguments?.some(
		(a) =>
			a.name.value === 'if' &&
			a.value.kind === 'BooleanValue' &&
			!a.value.value,
	) ?? false;

const memo = new WeakMap<object, boolean>();

/**
 * Whether the operation selects `@defer` or `@stream`, the one case where a
 * query arrives in parts. A variable `if` counts as on: the server then
 * answers a single part when it is false.
 */
export function isIncremental(operation: {
	readonly document: unknown;
}): boolean {
	const document = operation.document as unknown as DocumentNode;
	let found = memo.get(document);
	if (found === undefined) {
		found = false;
		visit(document, {
			// biome-ignore lint/style/useNamingConvention: graphql's visitor key
			Directive(node) {
				if (
					(node.name.value === 'defer' || node.name.value === 'stream') &&
					!off(node)
				) {
					found = true;
					return BREAK;
				}
				return undefined;
			},
		});
		memo.set(document, found);
	}
	return found;
}
