/** Each interface and union with the object types it stands for, as codegen's `fragment-matcher` writes it. */
export type PossibleTypes = Readonly<Record<string, readonly string[]>>;

/**
 * Whether a fragment's type condition holds for an object's `__typename`:
 * `true`, `false`, or `undefined` when the cache cannot tell (an abstract
 * type with no `possibleTypes`, or an object with no `__typename`).
 */
export type TypeMatcher = (
	condition: string | undefined,
	typename: string | undefined,
) => boolean | undefined;

/**
 * Matches by `possibleTypes`, its members followed through nested abstract
 * types. Given any, it is taken as complete: a condition it does not list
 * is an object type. Given none, a condition other than the typename is
 * undecided.
 */
export function typeMatcher(possibleTypes: PossibleTypes = {}): TypeMatcher {
	const members = closure(possibleTypes);
	const known = members.size > 0;
	return (condition, typename) => {
		if (condition === undefined || condition === typename) return true;
		if (typename === undefined) return undefined;
		const types = members.get(condition);
		if (types) return types.has(typename);
		return known ? false : undefined;
	};
}

/** Each abstract type with every type it stands for, at any depth. */
function closure(possibleTypes: PossibleTypes): Map<string, Set<string>> {
	const members = new Map<string, Set<string>>();
	const expand = (type: string, into: Set<string>, seen: Set<string>) => {
		if (seen.has(type)) return;
		seen.add(type);
		for (const member of possibleTypes[type] ?? []) {
			into.add(member);
			if (Object.hasOwn(possibleTypes, member)) expand(member, into, seen);
		}
	};
	for (const type of Object.keys(possibleTypes)) {
		const into = new Set<string>();
		expand(type, into, new Set());
		members.set(type, into);
	}
	return members;
}
