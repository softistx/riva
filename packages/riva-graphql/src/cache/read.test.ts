// biome-ignore-all lint/style/useNamingConvention: GraphQL type names are PascalCase keys.
import { describe, expect, test } from 'bun:test';
import { evict } from '@softistx/riva/entities';
import { newStore, walkOf, writeInto } from '../../test/cache';
import { readResult } from './read';

const patientQuery =
	'query ($id: ID!) { patient(id: $id) { __typename id name doctor { __typename id name } } }';
const ada = {
	patient: {
		__typename: 'Patient',
		id: '1',
		name: 'Ada',
		doctor: { __typename: 'Doctor', id: 'd', name: 'Grey' },
	},
};

/** Writes `data` through `source`, and reads it back through `other`. */
function roundTrip(
	source: string,
	data: unknown,
	other = source,
	vars: Record<string, unknown> = {},
	possibleTypes?: Record<string, string[]>,
) {
	const store = newStore();
	const root = writeInto(store, walkOf(source, vars, possibleTypes), data);
	return readResult(walkOf(other, vars, possibleTypes), store, root);
}

describe('readResult', () => {
	test('what was written reads back, through another selection with fragments and aliases', () => {
		const store = newStore();
		const root = writeInto(store, walkOf(patientQuery, { id: '1' }), ada);
		const other = walkOf(
			`query ($id: ID!) { someone: patient(id: $id) { ...Name carer: doctor { name } } }
			fragment Name on Patient { name }`,
			{ id: '1' },
		);
		// Another document over the same entities: aliases and fragments read them back.
		const second = writeInto(store, other, {
			someone: { name: 'Ada', carer: { name: 'Grey' } },
		});
		expect(readResult(other, store, second)).toEqual({
			someone: { name: 'Ada', carer: { name: 'Grey' } },
		});
		expect(readResult(walkOf(patientQuery, { id: '1' }), store, root)).toEqual(
			ada,
		);
	});

	test('a field never written, or an argument set never fetched, is a miss', () => {
		const store = newStore();
		const root = writeInto(store, walkOf(patientQuery, { id: '1' }), ada);
		expect(
			readResult(walkOf(patientQuery, { id: '1' }), store, {
				...root,
				vars: { id: '2' },
			}),
		).toBeUndefined();
		const more = walkOf('{ patient(id: "1") { name age } }');
		expect(readResult(more, store, root)).toBeUndefined();
	});

	test('a reference to an evicted entity is a miss', () => {
		const store = newStore();
		const root = writeInto(store, walkOf(patientQuery, { id: '1' }), ada);
		evict(store.client, 'Doctor:d');
		expect(
			readResult(walkOf(patientQuery, { id: '1' }), store, root),
		).toBeUndefined();
	});

	test('a union read with possibleTypes takes the matching fragment only', () => {
		const source =
			'{ search { __typename ... on Patient { id name } ... on Doctor { id ward } } }';
		const data = {
			search: [
				{ __typename: 'Patient', id: '1', name: 'Ada' },
				{ __typename: 'Doctor', id: '2', ward: 'ER' },
			],
		};
		expect(
			roundTrip(source, data, source, {}, { Person: ['Patient', 'Doctor'] }),
		).toEqual(data);
	});

	test('without possibleTypes, a fragment on an interface is read when whole', () => {
		const store = newStore();
		const source = '{ node { __typename id ... on Named { name } } }';
		const data = { node: { __typename: 'User', id: 'u', name: 'Ada' } };
		const root = writeInto(store, walkOf(source), data);
		expect(readResult(walkOf(source), store, root)).toEqual(data);
		const other = walkOf('{ node { __typename id ... on Titled { title } } }');
		expect(readResult(other, store, root)).toEqual({
			node: { __typename: 'User', id: 'u' },
		});
	});

	test('without possibleTypes, a list read twice is merged item by item', () => {
		const source =
			'{ box { __typename id items { a } ... on Thing { items { b } } } }';
		const data = {
			box: {
				__typename: 'Box',
				id: '1',
				items: [
					{ a: 1, b: 2 },
					{ a: 3, b: 4 },
				],
			},
		};
		expect(roundTrip(source, data)).toEqual(data);
	});

	test('a skipped field is not needed; an included one is', () => {
		const store = newStore();
		const root = writeInto(store, walkOf('{ patient { __typename id } }'), {
			patient: { __typename: 'Patient', id: '1' },
		});
		const source =
			'query ($full: Boolean!) { patient { __typename id name @include(if: $full) } }';
		expect(
			readResult(walkOf(source), store, { ...root, vars: { full: false } }),
		).toEqual({
			patient: { __typename: 'Patient', id: '1' },
		});
		expect(
			readResult(walkOf(source), store, { ...root, vars: { full: true } }),
		).toBeUndefined();
	});

	test('a variable left out reads its default', () => {
		const store = newStore();
		const root = writeInto(store, walkOf('{ items(first: 2) }'), {
			items: [1, 2],
		});
		const read = walkOf('query ($n: Int = 2) { items(first: $n) }');
		expect(readResult(read, store, { ...root, vars: read.variables })).toEqual({
			items: [1, 2],
		});
	});

	test('an empty root is a miss', () => {
		expect(
			readResult(walkOf('{ a }'), newStore(), { vars: {}, data: {} }),
		).toBeUndefined();
	});
});
