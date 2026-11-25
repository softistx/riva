import { type DataOperation, type DataSource, RivaError } from '@softistx/riva';
import { type DocumentNode, parse } from 'graphql';
import { type Operation, operationOf } from '../operation';
import { transportOf } from '../transport';

/**
 * What `allowlist` reads: the manifest as a JSON import types it (`kind` is a
 * `string`), so no assertion is needed. `AllowlistManifest` fits it.
 */
export type AllowlistInput = Readonly<
	Record<
		string,
		{
			readonly id: string;
			readonly name: string;
			readonly kind: string;
			readonly document: string;
		}
	>
>;

/**
 * The server side of `bffTransport`: runs the operations of `buildAllowlist`'s
 * manifest through the request riva's transport (`provideGraphQL`). Only the
 * manifest's ids are known, and the text executed is the manifest's, never the
 * browser's. Each document is parsed once, on first use.
 */
export function allowlist(manifest: AllowlistInput): DataSource {
	for (const id of Object.keys(manifest)) {
		const kind = manifest[id]?.kind;
		if (kind !== 'query' && kind !== 'mutation')
			throw new RivaError(
				'RIVA_DEFINITION',
				`riva-graphql: the allowlist entry "${id}" has the kind "${String(kind)}", not "query" or "mutation": rerun the codegen to rebuild the manifest.`,
			);
	}
	const made = new Map<string, DataOperation>();
	return {
		find(id) {
			// An own key only: `__proto__` or `toString` are not ids.
			const entry = Object.hasOwn(manifest, id) ? manifest[id] : undefined;
			if (!entry) return undefined;
			let op = made.get(id);
			if (!op) {
				let operation: Operation | undefined;
				op = {
					kind: entry.kind as DataOperation['kind'],
					run(riva, variables, signal) {
						operation ??= {
							...operationOf(parse(entry.document) as DocumentNode),
							id: entry.id,
						};
						return transportOf(riva).execute(operation, variables, {
							signal,
						});
					},
				};
				made.set(id, op);
			}
			return op;
		},
	};
}

export type { DataOperation, DataSource };
