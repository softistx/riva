import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type DefinitionNode, Kind, parse } from 'graphql';

export interface AllowlistConfig {
	/**
	 * What keys the manifest. `persisted` (default): the preset's own keys, the
	 * `__meta__.hash` the runtime sends. `name`: the operation name, for
	 * documents with no persisted id (the runtime then uses the name as the id).
	 */
	ids?: 'persisted' | 'name';
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

const operationOf = (definitions: readonly DefinitionNode[]) =>
	definitions.filter((d) => d.kind === Kind.OPERATION_DEFINITION);

/**
 * Builds the manifest from the client preset's `persisted-documents.json`
 * (`{ [hash]: text }`). The hash keys are kept as they are, so an id is the
 * very `__meta__.hash` the runtime sends. Deterministic: sorted by id.
 *
 * Throws on a text with no named query or mutation, and when two operations
 * share a name (names are the ids of `ids: 'name'`).
 */
export function buildAllowlist(
	persisted: Readonly<Record<string, string>>,
	config: AllowlistConfig = {},
): AllowlistManifest {
	const byName = new Map<string, string>();
	const entries: AllowlistEntry[] = [];
	for (const [hash, text] of Object.entries(persisted)) {
		const [op, ...rest] = operationOf(parse(text).definitions);
		if (!op || rest.length > 0 || op.kind !== Kind.OPERATION_DEFINITION)
			throw new Error(
				`@softistx/riva-graphql/codegen: the persisted document ${hash} must hold exactly one operation.`,
			);
		const name = op.name?.value;
		if (!name || op.operation === 'subscription')
			throw new Error(
				`@softistx/riva-graphql/codegen: the persisted document ${hash} must be a named query or mutation.`,
			);
		const first = byName.get(name);
		if (first !== undefined)
			throw new Error(
				`@softistx/riva-graphql/codegen: the operation "${name}" is defined twice (${first} and ${hash}); operation names must be unique.`,
			);
		byName.set(name, hash);
		entries.push({
			id: config.ids === 'name' ? name : hash,
			name,
			kind: op.operation,
			document: text,
		});
	}
	entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return Object.fromEntries(entries.map((e) => [e.id, e]));
}

/**
 * Reads the preset's `persisted-documents.json` and writes the allowlist
 * manifest next to where the BFF reads it. Run it after codegen, from
 * `hooks.afterAllFileWrite` (the preset's files all exist by then, whatever
 * the order of the outputs).
 */
export async function writeAllowlist(
	persistedPath: string,
	outPath: string,
	config: AllowlistConfig = {},
): Promise<AllowlistManifest> {
	const persisted = JSON.parse(await readFile(persistedPath, 'utf8'));
	const manifest = buildAllowlist(persisted, config);
	await mkdir(dirname(outPath), { recursive: true });
	await writeFile(outPath, `${JSON.stringify(manifest, null, '\t')}\n`);
	return manifest;
}
