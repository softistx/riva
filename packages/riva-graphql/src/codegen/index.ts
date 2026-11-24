import type { Types } from '@graphql-codegen/plugin-helpers';
import type { GraphQLSchema } from 'graphql';
import { persistedIdOf } from '../persisted-id';
import { operationsOf } from './text';

export interface AllowlistConfig {
	/**
	 * What keys the manifest. `hash` (default): the SHA-256 of the operation's
	 * text, for documents the transport names by persisted id. `name`: the
	 * operation name, for documents with no persisted id (the runtime then uses
	 * the name as the id).
	 */
	ids?: 'hash' | 'name';
}

export interface AllowlistEntry {
	readonly id: string;
	readonly name: string;
	readonly kind: 'query' | 'mutation';
	/** The text to execute: the operation and the fragments it uses. */
	readonly document: string;
}

/** The manifest a `/_data` route reads: entries by id, sorted by id. */
export type AllowlistManifest = Readonly<Record<string, AllowlistEntry>>;

/** Builds the manifest of the queries and mutations in `documents`. Throws when two operations share a name. */
export async function buildAllowlist(
	documents: readonly Types.DocumentFile[],
	config: AllowlistConfig = {},
): Promise<AllowlistManifest> {
	const byName = new Map<string, string>();
	const entries: AllowlistEntry[] = [];
	for (const { node, location, text } of operationsOf(documents)) {
		const name = node.name?.value as string;
		const first = byName.get(name);
		if (first !== undefined)
			throw new Error(
				`@softistx/riva-graphql/codegen: the operation "${name}" is defined twice (${first} and ${location}); operation names must be unique, they are the allowlist ids.`,
			);
		byName.set(name, location);
		entries.push({
			id: config.ids === 'name' ? name : await persistedIdOf(text),
			name,
			kind: node.operation as AllowlistEntry['kind'],
			document: text,
		});
	}
	entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return Object.fromEntries(entries.map((e) => [e.id, e]));
}

/**
 * The graphql-codegen plugin: writes the allowlist manifest, JSON keyed by
 * persisted id, for the BFF's `/_data` route. Deterministic: sorted by id, the
 * same documents give the same bytes.
 *
 * ```ts
 * generates: { 'app/generated/allowlist.json': { plugins: ['@softistx/riva-graphql/codegen'] } }
 * ```
 */
export async function plugin(
	_schema: GraphQLSchema,
	documents: Types.DocumentFile[],
	config: AllowlistConfig = {},
): Promise<string> {
	return `${JSON.stringify(await buildAllowlist(documents, config), null, '\t')}\n`;
}
