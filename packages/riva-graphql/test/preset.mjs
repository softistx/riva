// Runs the real client preset with `persistedDocuments: true` under Node (the
// runtime codegen is used with) and writes its files to the directory in argv.
// Usage: node test/preset.mjs <outDir>

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { generate } from '@graphql-codegen/cli';
import { preset } from '@graphql-codegen/client-preset';

const [outDir] = process.argv.slice(2);
const src = await mkdtemp(join(tmpdir(), 'riva-preset-'));
await writeFile(
	join(src, 'schema.graphql'),
	`type Query { patients(school: ID!): [Patient!]! viewer: Patient }
	type Mutation { renamePatient(id: ID!, name: String!): Patient! }
	type Patient { id: ID! name: String! school: School! }
	type School { id: ID! title: String! }`,
);
await writeFile(
	join(src, 'documents.ts'),
	`import { graphql } from './gen/gql';
export const SCHOOL_FRAGMENT = graphql(\`fragment SchoolFields on School { id title }\`);
export const PATIENT_FRAGMENT = graphql(\`fragment PatientFields on Patient { id name school { ...SchoolFields } }\`);
export const PATIENTS_QUERY = graphql(\`
	query Patients($school: ID!) {
		patients(school: $school) { ...PatientFields }
	}
\`);
export const VIEWER_QUERY = graphql(\`query Viewer { viewer { ...PatientFields } }\`);
export const RENAME_PATIENT_MUTATION = graphql(\`
	mutation RenamePatient($id: ID!, $name: String!) {
		renamePatient(id: $id, name: $name) { ...PatientFields }
	}
\`);
`,
);
const files = await generate(
	{
		silent: true,
		cwd: src,
		schema: join(src, 'schema.graphql'),
		documents: [join(src, 'documents.ts')],
		generates: {
			[`${join(src, 'gen')}/`]: {
				preset,
				presetConfig: { persistedDocuments: true },
			},
		},
	},
	false,
);
for (const { filename, content } of files) {
	const target = join(outDir, filename.slice(src.length + 1));
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, content);
}
