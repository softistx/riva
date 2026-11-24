import {
	type DocumentNode,
	type FragmentDefinitionNode,
	Kind,
	type OperationDefinitionNode,
	print,
	visit,
} from 'graphql';

export interface FoundOperation {
	readonly node: OperationDefinitionNode;
	/** Where it was defined, for messages. */
	readonly location: string;
	/** The text sent for it: the operation, then the fragments it uses, by name. */
	readonly text: string;
}

const spreadsOf = (node: OperationDefinitionNode | FragmentDefinitionNode) => {
	const names: string[] = [];
	visit(node, {
		[Kind.FRAGMENT_SPREAD](spread) {
			names.push(spread.name.value);
		},
	});
	return names;
};

/** The names of the fragments `node` uses, directly or through other fragments, sorted. */
function fragmentsUsed(
	node: OperationDefinitionNode,
	fragments: ReadonlyMap<string, FragmentDefinitionNode>,
	location: string,
): FragmentDefinitionNode[] {
	const seen = new Set<string>();
	const queue = spreadsOf(node);
	for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
		if (seen.has(name)) continue;
		const fragment = fragments.get(name);
		if (!fragment)
			throw new Error(
				`@softistx/riva-graphql/codegen: ${location} uses the fragment "${name}", which no document defines.`,
			);
		seen.add(name);
		queue.push(...spreadsOf(fragment));
	}
	return [...seen]
		.sort()
		.map((n) => fragments.get(n) as FragmentDefinitionNode);
}

/** Every query and mutation of the documents, with the exact text to send for each. Subscriptions are skipped. */
export function operationsOf(
	documents: readonly { document?: DocumentNode; location?: string }[],
): FoundOperation[] {
	const fragments = new Map<string, FragmentDefinitionNode>();
	for (const { document } of documents)
		for (const d of document?.definitions ?? [])
			if (d.kind === Kind.FRAGMENT_DEFINITION && !fragments.has(d.name.value))
				fragments.set(d.name.value, d);
	const found: FoundOperation[] = [];
	for (const { document, location = '(unknown file)' } of documents)
		for (const node of document?.definitions ?? []) {
			if (node.kind !== Kind.OPERATION_DEFINITION) continue;
			if (node.operation === 'subscription') continue;
			if (!node.name)
				throw new Error(
					`@softistx/riva-graphql/codegen: an anonymous ${node.operation} in ${location}; name it so it has an id.`,
				);
			const used = fragmentsUsed(node, fragments, location);
			const text = print({
				kind: Kind.DOCUMENT,
				definitions: [node, ...used],
			});
			found.push({ node, location, text });
		}
	return found;
}
