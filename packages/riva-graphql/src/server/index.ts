import type { DataOperation, DataSource } from '@softistx/riva';
import { type DocumentNode, parse } from 'graphql';
import type { AllowlistManifest } from '../codegen/index';
import { type Operation, operationOf } from '../operation';
import { transportOf } from '../transport';

/**
 * The server side of `bffTransport`: runs the operations of `buildAllowlist`'s
 * manifest through the request client's transport (`provideGraphQL`). Only the
 * manifest's ids are known, and the text executed is the manifest's, never the
 * browser's. Each document is parsed once, on first use.
 */
export function allowlist(manifest: AllowlistManifest): DataSource {
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
					kind: entry.kind,
					run(client, variables, signal) {
						operation ??= {
							...operationOf(parse(entry.document) as DocumentNode),
							id: entry.id,
						};
						return transportOf(client).execute(operation, variables, {
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
