import { createRiva, type Riva } from '@softistx/riva';
import {
	type EntityReader,
	entities,
	type Fields,
} from '@softistx/riva/entities';
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

/** The entity store as the specs use it: the reader a codec gets, and what only the core writes with. */
export type TestStore = Omit<EntityReader, 'identify'> & {
	identify: (obj: Fields) => string | undefined;
	readonly riva: Riva;
	readonly empty: boolean;
	merge(ref: string, fields: Record<string, unknown>): void;
};

/** The entity store of `riva`, captured through a codec: the core does not export it. */
export function storeOfRiva(riva: Riva): TestStore {
	let captured: unknown;
	entities(undefined, {
		normalize: (store) => {
			captured = store;
			return { root: undefined, pending: new Map() };
		},
		denormalize: () => undefined,
	}).write(riva, {}, undefined, undefined);
	return captured as TestStore;
}

/** A fresh riva's entity store. */
export const newStore = (): TestStore => storeOfRiva(createRiva());

/** Writes `data` into the store as a query entry would, and returns the entry's root. */
export function writeInto(store: TestStore, walk: Walk, data: unknown): Root {
	const { root, pending } = writeResult(walk, store, data);
	for (const [ref, fields] of pending) store.merge(ref, fields);
	return root as Root;
}
