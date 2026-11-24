import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { operationOf } from '../operation';
import { buildAllowlist, writeAllowlist } from './index';

// The regression this guards: the allowlist ids must be the very
// `__meta__.hash` the real client preset writes on its documents.
let dir: string;
// biome-ignore lint/style/useNamingConvention: the preset's `__meta__`
type Generated = Record<string, { __meta__?: { hash: string } } | undefined>;
let generated: Generated;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'riva-graphql-'));
	const run = Bun.spawnSync(['node', 'test/preset.mjs', dir], {
		cwd: join(import.meta.dir, '../..'),
		stderr: 'pipe',
	});
	if (run.exitCode !== 0) throw new Error(run.stderr.toString());
	generated = await import(join(dir, 'gen/graphql.ts'));
}, 60_000);

afterAll(() => rm(dir, { recursive: true, force: true }));

const persistedPath = () => join(dir, 'gen/persisted-documents.json');
const persisted = async (): Promise<Record<string, string>> =>
	JSON.parse(await readFile(persistedPath(), 'utf8'));

test('every generated __meta__.hash is a manifest key, and the runtime id equals it', async () => {
	const manifest = buildAllowlist(await persisted());
	const documents: [string, string][] = [
		['Patients', 'PatientsDocument'],
		['Viewer', 'ViewerDocument'],
		['RenamePatient', 'RenamePatientDocument'],
	];
	for (const [name, exportName] of documents) {
		const document = generated[exportName];
		const hash = document?.__meta__?.hash;
		expect(hash).toStartWith('sha256:');
		const op = operationOf(document as never);
		expect(op.id).toBe(hash as string);
		expect(manifest[op.id]?.name).toBe(name);
	}
	expect(Object.keys(manifest)).toHaveLength(3);
});

test('an entry carries the operation and the fragments it uses, nested ones included', async () => {
	const manifest = buildAllowlist(await persisted());
	const patients = Object.values(manifest).find((e) => e.name === 'Patients');
	expect(patients?.kind).toBe('query');
	expect(patients?.document).toContain('fragment PatientFields');
	expect(patients?.document).toContain('fragment SchoolFields');
});

test('ids: name keys the manifest by operation name, as the runtime does without a persisted id', async () => {
	const manifest = buildAllowlist(await persisted(), { ids: 'name' });
	expect(Object.keys(manifest)).toEqual([
		'Patients',
		'RenamePatient',
		'Viewer',
	]);
});

test('writeAllowlist writes the manifest next to the BFF, deterministic and sorted', async () => {
	const out = join(dir, 'out/allowlist.json');
	await writeAllowlist(persistedPath(), out);
	const text = await readFile(out, 'utf8');
	const ids = Object.keys(JSON.parse(text));
	expect(ids).toEqual([...ids].sort());
	expect(ids).toEqual(Object.keys(buildAllowlist(await persisted())));
	expect(text.endsWith('}\n')).toBe(true);
	await writeAllowlist(persistedPath(), out);
	expect(await readFile(out, 'utf8')).toBe(text);
});
