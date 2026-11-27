/** The slice of a graphql AST node this walk reads. */
type Node = {
	readonly kind?: unknown;
	readonly name?: { readonly value?: unknown };
	readonly arguments?: readonly Node[];
	readonly value?: unknown;
};

/** A literal `if: false` switches `@defer` and `@stream` off. */
const off = (directive: Node): boolean =>
	directive.arguments?.some(
		(a) =>
			a.name?.value === 'if' &&
			(a.value as Node | undefined)?.kind === 'BooleanValue' &&
			!(a.value as { value?: unknown }).value,
	) ?? false;

/**
 * Walks the document without graphql's `visit`, so the runtime entry never
 * imports graphql. `loc` is skipped: it holds the source, not nodes.
 */
function walk(node: unknown): boolean {
	if (Array.isArray(node)) return node.some(walk);
	if (node === null || typeof node !== 'object') return false;
	const n = node as Node;
	if (
		n.kind === 'Directive' &&
		(n.name?.value === 'defer' || n.name?.value === 'stream') &&
		!off(n)
	)
		return true;
	for (const key in n)
		if (key !== 'loc' && walk((n as Record<string, unknown>)[key])) return true;
	return false;
}

const memo = new WeakMap<object, boolean>();

/**
 * Whether the operation selects `@defer` or `@stream`, the one case where a
 * query arrives in parts. A variable `if` counts as on: the server then
 * answers a single part when it is false.
 */
export function isIncremental(operation: {
	readonly document: unknown;
}): boolean {
	const document = operation.document as object;
	let found = memo.get(document);
	if (found === undefined) {
		found = walk(document);
		memo.set(document, found);
	}
	return found;
}
