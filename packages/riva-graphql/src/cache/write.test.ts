// biome-ignore-all lint/style/useNamingConvention: GraphQL type names are PascalCase keys.
import { describe, expect, test } from 'bun:test';
import { RivaError } from '@softistx/riva';
import { newStore, walkOf, writeInto } from '../../test/cache';
import type { PossibleTypes } from './type-match';
import { writeResult } from './write';

function write(
	source: string,
	data: unknown,
	variables: Record<string, unknown> = {},
	store = newStore(),
	possibleTypes?: PossibleTypes,
) {
	const root = writeInto(store, walkOf(source, variables, possibleTypes), data);
	return { store, root };
}

const dune = {
	__typename: 'Patient',
	id: '1',
	name: 'Ada',
	doctor: { __typename: 'Doctor', id: 'd', name: 'Grey' },
};

describe('writeResult', () => {
	test('nested entities become references, the root fields sit in the entry', () => {
		const { store, root } = write(
			'{ patient(id: "1") { __typename id name doctor { __typename id name } } }',
			{ patient: dune },
		);
		expect(root.data).toEqual({
			'patient({"id":"1"})': { __ref: 'Patient:1' },
		});
		expect(store.peek('Patient:1')).toEqual({
			__typename: 'Patient',
			id: '1',
			name: 'Ada',
			doctor: { __ref: 'Doctor:d' },
		});
		expect(store.peek('Doctor:d')).toEqual({
			__typename: 'Doctor',
			id: 'd',
			name: 'Grey',
		});
	});

	test('the entry keeps the variables, defaults applied', () => {
		const { root } = write('query ($n: Int = 2) { a(n: $n) }', { a: 1 });
		expect(root.vars).toEqual({ n: 2 });
	});

	test('an object with no identity is stored inside its parent, merged with what it held', () => {
		const { store } = write(
			'{ viewer { __typename id settings { __typename theme } } }',
			{
				viewer: {
					__typename: 'User',
					id: 'u',
					settings: { __typename: 'Settings', theme: 'dark' },
				},
			},
		);
		write(
			'{ viewer { __typename id settings { __typename lang } } }',
			{
				viewer: {
					__typename: 'User',
					id: 'u',
					settings: { __typename: 'Settings', lang: 'fr' },
				},
			},
			{},
			store,
		);
		expect(store.peek('User:u')?.['settings']).toEqual({
			__typename: 'Settings',
			theme: 'dark',
			lang: 'fr',
		});
	});

	test('lists of entities, of scalars, and nulls', () => {
		const { store, root } = write('{ patients { __typename id tags } empty }', {
			patients: [
				{ __typename: 'Patient', id: '1', tags: ['a', 'b'] },
				null,
				{ __typename: 'Patient', id: '2', tags: [] },
			],
			empty: null,
		});
		expect(root.data).toEqual({
			patients: [{ __ref: 'Patient:1' }, null, { __ref: 'Patient:2' }],
			empty: null,
		});
		expect(store.peek('Patient:1')?.['tags']).toEqual(['a', 'b']);
	});

	test('arguments from variables, sorted; aliases resolved to field names', () => {
		const { store, root } = write(
			'query ($sort: Sort) { first: patients(sort: $sort, first: 2) { __typename id n: name } }',
			{ first: [{ __typename: 'Patient', id: '1', n: 'Ada' }] },
			{ sort: { desc: true, by: 'NAME' } },
		);
		expect(Object.keys(root.data)).toEqual([
			'patients({"first":2,"sort":{"by":"NAME","desc":true}})',
		]);
		expect(store.peek('Patient:1')?.['name']).toBe('Ada');
	});

	test('one stored field per argument set', () => {
		const store = newStore();
		write(
			'{ patient(id: "1") { __typename id friends(first: 1) { __typename id } } }',
			{
				patient: {
					__typename: 'Patient',
					id: '1',
					friends: [{ __typename: 'Patient', id: '2' }],
				},
			},
			{},
			store,
		);
		write(
			'{ patient(id: "1") { __typename id friends(first: 2) { __typename id } } }',
			{
				patient: {
					__typename: 'Patient',
					id: '1',
					friends: [
						{ __typename: 'Patient', id: '2' },
						{ __typename: 'Patient', id: '3' },
					],
				},
			},
			{},
			store,
		);
		const fields = store.peek('Patient:1') ?? {};
		expect(fields['friends({"first":1})']).toEqual([{ __ref: 'Patient:2' }]);
		expect(fields['friends({"first":2})']).toEqual([
			{ __ref: 'Patient:2' },
			{ __ref: 'Patient:3' },
		]);
	});

	test('fragments on an interface and a union, matched by possibleTypes', () => {
		const { store } = write(
			`{ search { __typename ...on Node { id } ...Person } }
			fragment Person on Person { ... on Patient { age } ... on Doctor { ward } }`,
			{
				search: [
					{ __typename: 'Patient', id: '1', age: 41 },
					{ __typename: 'Doctor', id: '2', ward: 'ER' },
				],
			},
			{},
			undefined,
			{ Node: ['Patient', 'Doctor'], Person: ['Patient', 'Doctor'] },
		);
		expect(store.peek('Patient:1')).toEqual({
			__typename: 'Patient',
			id: '1',
			age: 41,
		});
		expect(store.peek('Doctor:2')).toEqual({
			__typename: 'Doctor',
			id: '2',
			ward: 'ER',
		});
	});

	test('a skipped field is not written', () => {
		const { store } = write(
			'query ($full: Boolean!) { patient { __typename id name @include(if: $full) } }',
			{ patient: { __typename: 'Patient', id: '1' } },
			{ full: false },
		);
		expect(store.peek('Patient:1')).toEqual({ __typename: 'Patient', id: '1' });
	});

	test("a mutation's root fields are not kept, its entities are", () => {
		const { store, root } = write(
			'mutation ($password: String!) { signIn(password: $password) { __typename id name } }',
			{ signIn: { __typename: 'User', id: 'u', name: 'Ada' } },
			{ password: 'secret' },
		);
		expect(root).toBeUndefined();
		expect(store.peek('User:u')).toEqual({
			__typename: 'User',
			id: 'u',
			name: 'Ada',
		});
	});

	test('a JSON scalar is kept as it came, never normalized', () => {
		const payload = { __typename: 'Patient', id: '9', nested: { a: 1 } };
		const { store, root } = write('{ settings }', { settings: payload });
		expect(root.data['settings']).toEqual(payload);
		expect(store.peek('Patient:9')).toBeUndefined();
	});

	test('the identity reads the fields by name, aliases resolved', () => {
		const store = newStore();
		store.identify = (o) => `Patient:${String(o['number'])}`;
		const { root } = write(
			'{ patient { __typename mrn: number name } }',
			{ patient: { __typename: 'Patient', mrn: '78', name: 'Ada' } },
			{},
			store,
		);
		expect(root.data['patient']).toEqual({ __ref: 'Patient:78' });
		expect(store.peek('Patient:78')).toEqual({
			number: '78',
			name: 'Ada',
			__typename: 'Patient',
		});
	});

	test('nothing is merged by the walk: a refusal changes nothing', () => {
		const store = newStore();
		const walk = walkOf('{ patient { __typename id born } }');
		expect(() =>
			writeResult(walk, store, {
				patient: { __typename: 'Patient', id: '1', born: new Date(0) },
			}),
		).toThrow(RivaError);
		expect(store.empty).toBe(true);
	});

	test('data that is not an object throws', () => {
		expect(() => writeResult(walkOf('{ a }'), newStore(), null)).toThrow(
			"The GraphQL cache stores an operation's data",
		);
	});
});
