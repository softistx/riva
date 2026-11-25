import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { RivaError } from '@softistx/riva';
import type { DocumentNode } from 'graphql';

export type OperationKind = 'query' | 'mutation' | 'subscription';

/**
 * What a transport executes: the typed document and what was read from it.
 * `id` names the operation to a server that holds an allowlist: its persisted
 * id when the document carries one, else its name.
 */
export interface Operation<Data = unknown, Vars = unknown> {
	readonly document: TypedDocumentNode<Data, Vars>;
	/** The operation's name, unique in the application. */
	readonly name: string;
	readonly kind: OperationKind;
	/** The client preset's `__meta__.hash`, when the document carries one. */
	readonly persistedId: string | undefined;
	/** `persistedId`, else `name`. */
	readonly id: string;
}

const cache = new WeakMap<object, Operation>();

/** `__meta__.hash` of a document the client preset wrote with `persistedDocuments`. */
function hashOf(document: object): string | undefined {
	// biome-ignore lint/style/useNamingConvention: the client preset's property
	const meta = (document as { __meta__?: { hash?: unknown } }).__meta__;
	return typeof meta?.hash === 'string' ? meta.hash : undefined;
}

function read(document: DocumentNode): Operation {
	const definitions = Array.isArray(document?.definitions)
		? document.definitions
		: undefined;
	if (!definitions)
		throw new RivaError(
			'RIVA_DEFINITION',
			'riva-graphql: expected a TypedDocumentNode (set documentMode: "documentNode" in the client preset), got something else.',
		);
	const operations = definitions.filter(
		(d) => d.kind === 'OperationDefinition',
	);
	const [first] = operations;
	if (!first)
		throw new RivaError(
			'RIVA_DEFINITION',
			'riva-graphql: the document holds no operation (a fragment alone cannot be queried).',
		);
	if (operations.length > 1)
		throw new RivaError(
			'RIVA_DEFINITION',
			`riva-graphql: the document holds ${operations.length} operations; define one operation per document.`,
		);
	const name = first.name?.value;
	if (!name)
		throw new RivaError(
			'RIVA_DEFINITION',
			'riva-graphql: the operation has no name; name it (query Patients { ... }) so it has an id.',
		);
	const persistedId = hashOf(document);
	return {
		document: document as unknown as Operation['document'],
		name,
		kind: first.operation,
		persistedId,
		id: persistedId ?? name,
	};
}

/**
 * Reads a document once. Throws a `RivaError` (`RIVA_DEFINITION`) when it is not a document node,
 * holds no operation, several or an unnamed one, or when it is not of the
 * `expected` kind (a subscription is refused unless it is the one expected).
 */
export function operationOf<Data, Vars>(
	document: TypedDocumentNode<Data, Vars>,
	expected?: OperationKind,
): Operation<Data, Vars> {
	let op = cache.get(document);
	if (!op) {
		op = read(document);
		cache.set(document, op);
	}
	if (op.kind === 'subscription' && expected !== 'subscription')
		throw new RivaError(
			'RIVA_DEFINITION',
			`riva-graphql: ${op.name} is a subscription; run it with riva.graphql.subscribe(), it has no query() or mutation() definition.`,
		);
	if (expected && op.kind !== expected)
		throw new RivaError(
			'RIVA_DEFINITION',
			`riva-graphql: ${op.name} is a ${op.kind}; use ${op.kind}() to define it, not ${expected}().`,
		);
	return op as Operation<Data, Vars>;
}
