import type { CachePolicy } from '@softistx/riva';
import { type EntitiesOptions, entities } from '@softistx/riva/entities';
import type { BoundOperation, OperationCache } from '../query';
import type { Variables } from './field-key';
import { readResult } from './read';
import { cacheDocumentOf, variablesOf, type Walk } from './selection';
import { type PossibleTypes, typeMatcher } from './type-match';
import { assertTypename } from './typename';
import { type Root, writeResult } from './write';

export interface NormalizedOptions extends EntitiesOptions {
	/** The abstract types' members, for fragments on interfaces and unions (codegen's `fragment-matcher`). */
	possibleTypes?: PossibleTypes;
}

/**
 * The selection-aware normalized cache, for `query(DOC, { cache: normalized() })`
 * and `mutation(DOC, { cache: normalized() })`. Share one between a client's
 * definitions: it fixes the entity identity rules the client's store uses.
 */
export function normalized(opts: NormalizedOptions = {}): OperationCache {
	const matches = typeMatcher(opts.possibleTypes);
	return {
		forOperation(op: BoundOperation): CachePolicy {
			assertTypename(op.document);
			const document = cacheDocumentOf(op.document);
			const walk = (variables: Variables): Walk => ({
				document,
				matches,
				variables,
			});
			return entities(opts, {
				normalize: (store, data, vars) =>
					writeResult(walk(variablesOf(document.operation, vars)), store, data),
				denormalize: (store, root) =>
					root === undefined
						? undefined
						: readResult(walk({}), store, root as Root),
			}) as CachePolicy;
		},
	};
}
