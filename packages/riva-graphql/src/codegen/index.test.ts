import { expect, test } from 'bun:test';
import { buildSchema, parse } from 'graphql';
import { persistedIdOf } from '../persisted-id';
import { buildAllowlist, plugin } from './index';

const schema = buildSchema('type Query { a: Int }');
const file = (location: string, source: string) => ({
	location,
	document: parse(source),
});

const docs = [
	file(
		'patients.graphql',
		'query Patients($school: ID!) { patients(school: $school) { ...PatientFields } }',
	),
	file('fragments.graphql', 'fragment PatientFields on Patient { id name }'),
	file(
		'rename.graphql',
		'mutation RenamePatient($id: ID!) { renamePatient(id: $id) { id } }',
	),
	file('sub.graphql', 'subscription Changed { changed { id } }'),
];

test('emits one entry per query and mutation, keyed by the persisted id of its text', async () => {
	const manifest = await buildAllowlist(docs);
	const entries = Object.values(manifest);
	expect(entries.map((e) => e.name).sort()).toEqual([
		'Patients',
		'RenamePatient',
	]);
	for (const [id, entry] of Object.entries(manifest)) {
		expect(entry.id).toBe(id);
		expect(id).toBe(await persistedIdOf(entry.document));
	}
	const patients = entries.find((e) => e.name === 'Patients');
	expect(patients?.kind).toBe('query');
	expect(patients?.document).toContain('fragment PatientFields');
	expect(entries.find((e) => e.name === 'RenamePatient')?.kind).toBe(
		'mutation',
	);
});

test('is deterministic whatever the order of the documents', async () => {
	const a = await plugin(schema, docs);
	const b = await plugin(schema, [...docs].reverse());
	expect(a).toBe(b);
	const ids = Object.keys(JSON.parse(a));
	expect(ids).toEqual([...ids].sort());
	expect(a.endsWith('}\n')).toBe(true);
});

test('ids: name keys the manifest by operation name', async () => {
	const manifest = await buildAllowlist(docs, { ids: 'name' });
	expect(Object.keys(manifest)).toEqual(['Patients', 'RenamePatient']);
});

test('refuses two operations of one name, naming both files', async () => {
	await expect(
		buildAllowlist([
			file('a.graphql', 'query Patients { a }'),
			file('b.graphql', 'query Patients { b }'),
		]),
	).rejects.toThrow(
		'the operation "Patients" is defined twice (a.graphql and b.graphql)',
	);
});

test('no document gives an empty manifest', async () => {
	expect(await plugin(schema, [])).toBe('{}\n');
});
