import { createRivaClient } from '@softistx/riva';
import { type EntityStore, storeOf } from '@softistx/riva/entities';
import { parse } from 'graphql';
import {
	cacheDocumentOf,
	variablesOf,
	type Walk,
} from '../src/cache/selection';
import { type PossibleTypes, typeMatcher } from '../src/cache/type-match';
import { type Root, writeResult } from '../src/cache/write';

/** A walk of `source` with its variables (defaults applied). */
export function walkOf(
	source: string,
	variables: Record<string, unknown> = {},
	possibleTypes?: PossibleTypes,
): Walk {
	const document = cacheDocumentOf(parse(source));
	return {
		document,
		variables: variablesOf(document.operation, variables),
		matches: typeMatcher(possibleTypes),
	};
}

/** A fresh client's entity store. */
export const newStore = (): EntityStore => storeOf(createRivaClient());

/** Writes `data` into the store as a query entry would, and returns the entry's root. */
export function writeInto(store: EntityStore, walk: Walk, data: unknown): Root {
	const { root, pending } = writeResult(walk, store, data);
	for (const [ref, fields] of pending) store.merge(ref, fields);
	return root as Root;
}
