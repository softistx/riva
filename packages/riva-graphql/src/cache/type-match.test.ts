// biome-ignore-all lint/style/useNamingConvention: GraphQL type names are PascalCase keys.
import { describe, expect, test } from 'bun:test';
import { typeMatcher } from './type-match';

describe('typeMatcher', () => {
	test('no condition, or no typename to compare, always matches', () => {
		const matches = typeMatcher();
		expect(matches(undefined, 'Patient')).toBe(true);
		expect(matches('Patient', undefined)).toBe(true);
	});

	test('with possibleTypes, an abstract type matches its members, at any depth', () => {
		const matches = typeMatcher({
			Node: ['Patient', 'Doctor'],
			Searchable: ['Person', 'Doctor'],
			Person: ['Patient', 'Nurse'],
		});
		expect(matches('Node', 'Patient')).toBe(true);
		expect(matches('Node', 'Nurse')).toBe(false);
		expect(matches('Searchable', 'Nurse')).toBe(true);
		// Not listed: an object type, which only matches itself.
		expect(matches('Nurse', 'Patient')).toBe(false);
	});

	test('without possibleTypes, another type is undecided', () => {
		expect(typeMatcher()('Node', 'Patient')).toBeUndefined();
		expect(typeMatcher({})('Patient', 'Patient')).toBe(true);
	});

	test('a cycle in possibleTypes does not loop', () => {
		const matches = typeMatcher({ A: ['B'], B: ['A', 'C'] });
		expect(matches('A', 'C')).toBe(true);
	});
});
