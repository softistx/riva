# Allowlist codegen

Entry point: `@softistx/riva-graphql/codegen` (Node and codegen only; needs `graphql`).

## What it is for

A BFF's `/_data` route executes only documents it knows by id. The client preset (`@graphql-codegen/client-preset`) with `persistedDocuments: true` writes `persisted-documents.json`, `{ [hash]: text }`, and puts the same hash on each document as `__meta__.hash`, the id a definition sends. `codegen` turns that file into the manifest: one entry per query and mutation, `{ id, name, kind, document }`, keyed by the preset's hash **as it is** (never recomputed, so an id matches by construction) and sorted, so the same documents give the same bytes.

## Wire it

```ts
// codegen.ts (needs @graphql-codegen/cli and @graphql-codegen/client-preset)
import type { CodegenConfig } from '@graphql-codegen/cli';
import { addTypenameSelectionDocumentTransform } from '@graphql-codegen/client-preset';

export default {
	schema: 'schema.graphql',
	documents: ['app/**/*.{ts,tsx}'],
	generates: {
		'app/generated/': {
			preset: 'riva',
			presetConfig: { persistedDocuments: true },
			// Needed by `normalized()`: it adds __typename to every selection set.
			documentTransforms: [addTypenameSelectionDocumentTransform],
		},
	},
	// Runs once every file is written, whatever the order of the outputs.
	hooks: { afterAllFileWrite: ['bun scripts/allowlist.ts'] },
} satisfies CodegenConfig;
```

```ts
// scripts/allowlist.ts
import { writeAllowlist } from '@softistx/riva-graphql/codegen';

await writeAllowlist(
	'app/generated/persisted-documents.json',
	'app/generated/allowlist.json',
);
```

## `buildAllowlist(persisted, config?)`

The same step without the files: it takes the parsed `persisted-documents.json` and returns the manifest.

```ts
import { buildAllowlist } from '@softistx/riva-graphql/codegen';

const manifest = buildAllowlist({
	'sha256:ab12…': 'fragment F on Patient { id } query Patients { patients { ...F } }',
});
// { 'sha256:ab12…': { id: 'sha256:ab12…', name: 'Patients', kind: 'query', document: '…' } }
```

## Options (`AllowlistConfig`)

| Option | Default | Meaning |
|---|---|---|
| `ids` | `'persisted'` | `'persisted'` keys by the preset's hash. `'name'` keys by operation name, for documents with no persisted id (the runtime then uses the name as the id). |

`document` is the preset's text for the operation: the operation and the fragments it uses.

## Traps

- It fails on a text with no operation or several, an anonymous one, a subscription, and two operations of one name.
- Do not rely on the order of outputs inside one codegen run: build the manifest from the `afterAllFileWrite` hook.
- Import the manifest JSON as it is: `allowlist` takes its JSON shape (`kind` as a `string`) and refuses an unknown kind at startup.
