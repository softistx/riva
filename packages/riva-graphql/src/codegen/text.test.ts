import { expect, test } from 'bun:test';
import { parse } from 'graphql';
import { operationsOf } from './text';

const file = (location: string, source: string) => ({
	location,
	document: parse(source),
});

test('an operation carries the fragments it uses, transitively, sorted, from any file', () => {
	const [op] = operationsOf([
		file('a.graphql', 'query Q { patient { ...B } }'),
		file(
			'f.graphql',
			'fragment B on Patient { id ...A } fragment A on Patient { name } fragment Unused on Patient { age }',
		),
	]);
	expect(op?.text).toBe(
		'query Q {\n  patient {\n    ...B\n  }\n}\n\nfragment A on Patient {\n  name\n}\n\nfragment B on Patient {\n  id\n  ...A\n}',
	);
	expect(op?.location).toBe('a.graphql');
});

test('a cycle of fragments ends', () => {
	const [op] = operationsOf([
		file(
			'a.graphql',
			'query Q { p { ...A } } fragment A on P { ...B } fragment B on P { ...A }',
		),
	]);
	expect(op?.text).toContain('fragment B');
});

test('subscriptions and fragment-only documents give no operation', () => {
	expect(
		operationsOf([
			file('a.graphql', 'subscription S { s }'),
			file('b.graphql', 'fragment F on P { id }'),
			{ location: 'c.graphql' },
		]),
	).toEqual([]);
});

test('an anonymous operation names its file', () => {
	expect(() => operationsOf([file('anon.graphql', '{ a }')])).toThrow(
		/anonymous query in anon\.graphql/,
	);
});

test('a missing fragment names the operation file and the fragment', () => {
	expect(() =>
		operationsOf([file('m.graphql', 'query Q { ...Nope }')]),
	).toThrow(/m\.graphql uses the fragment "Nope"/);
});
