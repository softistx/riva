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
