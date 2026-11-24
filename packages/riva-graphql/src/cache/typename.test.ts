import { describe, expect, test } from 'bun:test';
import { parse } from 'graphql';
import { assertTypename } from './typename';

const check = (source: string) => () => assertTypename(parse(source));

describe('assertTypename', () => {
	test('refuses a nested selection set without __typename', () => {
		expect(check('{ patient { id name } }')).toThrow(TypeError);
		expect(check('{ patient { id name } }')).toThrow(/^riva-graphql: /);
		expect(check('{ patient { id name } }')).toThrow(
			/"patient".*addTypenameSelectionDocumentTransform.*documentTransforms/,
		);
	});

	test('names the deepest offending field', () => {
		expect(check('{ patient { __typename id doctor { id } } }')).toThrow(
			/"doctor"/,
		);
	});

	test('accepts a document that selects it everywhere', () => {
		expect(
			check('{ patient { __typename id doctor { __typename id } } }'),
		).not.toThrow();
	});

	test('exempts the root operation set', () => {
		expect(check('{ viewer }')).not.toThrow();
		expect(check('mutation { ping }')).not.toThrow();
	});

	test('accepts a typename given by an inline fragment with no type condition', () => {
		expect(check('{ patient { ... { __typename id } } }')).not.toThrow();
	});

	test('refuses a typename given only by one branch of a union', () => {
		expect(
			check(
				'{ search { ... on Patient { __typename id } ... on Doctor { id } } }',
			),
		).toThrow(/"search"/);
		expect(check('{ patient { ... on Patient { __typename id } } }')).toThrow(
			TypeError,
		);
	});

	test('refuses a typename given only by a fragment spread', () => {
		expect(
			check(
				'query { patient { ...P } } fragment P on Patient { __typename id }',
			),
		).toThrow(/"patient"/);
	});

	test('checks the fragment definitions where they are spread', () => {
		expect(
			check(
				'query { patient { __typename ...P } } fragment P on Patient { doctor { id } }',
			),
		).toThrow(/"doctor"/);
	});

	test('does not loop on a cyclic fragment', () => {
		expect(
			check(
				'query { patient { __typename ...A } } fragment A on Patient { id ...A }',
			),
		).not.toThrow();
	});
});
