import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { Query } from '@softistx/riva';
/**
 * The variables a definition takes, from a document's variables type: `void`
 * (so the argument is optional) when the operation has none.
 */
export type VarsOf<V> = [keyof V] extends [never]
	? // biome-ignore lint/suspicious/noConfusingVoidType: no variables is `void`, as for a core query
		void
	: string extends keyof V
		? [V[string]] extends [never]
			? // biome-ignore lint/suspicious/noConfusingVoidType: no variables is `void`, as for a core query
				void
			: V
		: V;

/** The variables a call takes, from its target: a query definition's own, or a document's (`void` when it has none). */
export type TargetVars<T> =
	// biome-ignore lint/suspicious/noExplicitAny: matches any definition
	T extends Query<infer V, any>
		? V
		: // biome-ignore lint/suspicious/noExplicitAny: matches any document
			T extends TypedDocumentNode<any, infer V>
			? VarsOf<V>
			: never;

/** The data a call resolves with, from its target (a query definition or a document). */
export type TargetData<T> =
	// biome-ignore lint/suspicious/noExplicitAny: matches any definition
	T extends Query<any, infer D>
		? D
		: // biome-ignore lint/suspicious/noExplicitAny: matches any document
			T extends TypedDocumentNode<infer D, any>
			? D
			: never;
