import { expect, test } from 'bun:test';
import { buildAllowlist } from './index';

const persisted = {
	'sha256:b': 'fragment F on P { id } mutation RenamePatient { r { ...F } }',
	'sha256:a': 'fragment F on P { id } query Patients { patients { ...F } }',
};

test('keeps the hash keys as they are, sorted, with name and kind read from the text', () => {
	const manifest = buildAllowlist(persisted);
	expect(Object.keys(manifest)).toEqual(['sha256:a', 'sha256:b']);
	expect(manifest['sha256:a']).toEqual({
		id: 'sha256:a',
		name: 'Patients',
		kind: 'query',
		document: persisted['sha256:a'],
	});
	expect(manifest['sha256:b']?.kind).toBe('mutation');
});

test('refuses two operations of one name, naming both hashes', () => {
	expect(() =>
		buildAllowlist({
			'sha256:a': 'query Patients { a }',
			'sha256:b': 'query Patients { b }',
		}),
	).toThrow(
		'the operation "Patients" is defined twice (sha256:a and sha256:b)',
	);
});

test('refuses a text with no operation, an anonymous one or a subscription', () => {
	expect(() => buildAllowlist({ x: 'fragment F on P { id }' })).toThrow(
		'exactly one operation',
	);
	expect(() => buildAllowlist({ x: '{ a }' })).toThrow(
		'named query or mutation',
	);
	expect(() => buildAllowlist({ x: 'subscription S { a }' })).toThrow(
		'named query or mutation',
	);
});

test('an empty manifest for no document', () => {
	expect(buildAllowlist({})).toEqual({});
});
