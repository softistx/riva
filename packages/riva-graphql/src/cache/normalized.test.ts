/* biome-ignore-all lint/style/useNamingConvention: GraphQL's field names */
import { describe, expect, expectTypeOf, test } from 'bun:test';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import {
	query as coreQuery,
	createRiva,
	type Query,
	type Riva,
	RivaError,
} from '@softistx/riva';
import { evict, readEntity, writeEntity } from '@softistx/riva/entities';
import { parse } from 'graphql';
import { storeOfRiva } from '../../test/cache';
import { fakeTransport } from '../../test/fixtures';
import { infinite } from '../infinite';
import { mutation, query } from '../query';
import { provideGraphQL } from '../transport';
import { normalized } from './normalized';

interface Named {
	__typename: 'Patient';
	id: string;
	name: string;
}
const PATIENT_QUERY = parse(
	'query Patient($id: ID!) { patient(id: $id) { __typename id name } }',
) as TypedDocumentNode<{ patient: Named }, { id: string }>;
const PATIENTS_QUERY = parse(
	'query Patients { patients { __typename id name } }',
) as TypedDocumentNode<{ patients: Named[] }, { [key: string]: never }>;
const ALIASED_QUERY = parse(
	'query Aliased($id: ID!, $n: Int) { me: patient(id: $id) { __typename id label: name friends(first: $n) { __typename id } } }',
) as TypedDocumentNode<
	{ me: { label: string; friends: { id: string }[] } },
	{ id: string; n: number }
>;
const RENAME_MUTATION = parse(
	'mutation RenamePatient($id: ID!, $name: String!) { renamePatient(id: $id, name: $name) { __typename id name } }',
) as TypedDocumentNode<{ renamePatient: Named }, { id: string; name: string }>;

const ada: Named = { __typename: 'Patient', id: '1', name: 'Ada' };
const bob: Named = { __typename: 'Patient', id: '2', name: 'Bob' };

const deferred = <T>() => {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((a, b) => {
		resolve = a;
		reject = b;
	});
	return { promise, resolve, reject };
};

function setup(answer: Parameters<typeof fakeTransport>[0]) {
	const riva = createRiva();
	const transport = fakeTransport(answer);
	provideGraphQL(riva, transport);
	return { riva, transport };
}

const cache = normalized();
const staleTime = '1h';
const patient = query(PATIENT_QUERY, { cache, staleTime });
const patients = query(PATIENTS_QUERY, { cache, staleTime });
const rename = mutation(RENAME_MUTATION, {
	cache,
	optimistic: (v) => ({
		renamePatient: { __typename: 'Patient', id: v.id, name: v.name },
	}),
});

const answers = (current: { ada: string }) => (call: { name: string }) =>
	call.name === 'Patient'
		? { patient: { ...ada, name: current.ada } }
		: { patients: [{ ...ada, name: current.ada }, bob] };

describe('normalized() over the entity store', () => {
	test('two queries sharing an entity update each other', async () => {
		const name = { ada: 'Ada' };
		const { riva } = setup(answers(name));
		await patient.ensure(riva, { id: '1' });
		await patients.ensure(riva);
		const seen: string[] = [];
		const off = riva.subscribe(patient, { id: '1' }, (s) =>
			seen.push(s.data?.patient.name ?? '-'),
		);
		name.ada = 'Ada L.';
		patients.invalidate(riva);
		await Promise.resolve();
		await patients.ensure(riva);
		expect(riva.get(patient, { id: '1' }).data?.patient.name).toBe('Ada L.');
		expect(seen).toEqual(['Ada L.']);
		off();
	});

	test('a query unrelated to an entity is not notified by its change', async () => {
		const { riva } = setup(answers({ ada: 'Ada' }));
		await patient.ensure(riva, { id: '1' });
		let calls = 0;
		const off = riva.subscribe(patient, { id: '1' }, () => calls++);
		writeEntity(riva, 'Patient:2', { name: 'Robert' });
		expect(calls).toBe(0);
		writeEntity(riva, 'Patient:1', { name: 'Ada L.' });
		expect(calls).toBe(1);
		off();
	});

	test("a mutation's result commits into every query reading the entity", async () => {
		const { riva } = setup((call) =>
			call.name === 'RenamePatient'
				? { renamePatient: { ...ada, name: 'Zed' } }
				: answers({ ada: 'Ada' })(call),
		);
		await patient.ensure(riva, { id: '1' });
		await patients.ensure(riva);
		await rename.run(riva, { id: '1', name: 'Zed' });
		expect(riva.get(patient, { id: '1' }).data?.patient.name).toBe('Zed');
		expect(riva.get(patients).data?.patients[0]?.name).toBe('Zed');
	});

	test('the optimistic layer shows over the normalized data, then rolls back', async () => {
		const { riva, transport } = setup(answers({ ada: 'Ada' }));
		await patient.ensure(riva, { id: '1' });
		await patients.ensure(riva);
		const d = deferred<unknown>();
		transport.execute = async () => d.promise as never;
		const p = rename.run(riva, { id: '1', name: 'Zed' });
		expect(riva.get(patient, { id: '1' }).data?.patient.name).toBe('Zed');
		expect(riva.get(patients).data?.patients[0]?.name).toBe('Zed');
		expect(storeOfRiva(riva).peek('Patient:1')).toMatchObject({
			name: 'Ada',
		});
		d.reject(new Error('refused'));
		await p.catch(() => {});
		expect(riva.get(patient, { id: '1' }).data?.patient.name).toBe('Ada');
		expect(riva.get(patients).data?.patients[0]?.name).toBe('Ada');
	});

	test('an entity created by the optimistic layer exists only until it settles', async () => {
		const { riva, transport } = setup(() => ({}));
		const d = deferred<unknown>();
		transport.execute = async () => d.promise as never;
		const p = rename.run(riva, { id: '9', name: 'New' });
		expect(readEntity(riva, 'Patient:9')).toMatchObject({ name: 'New' });
		d.reject(new Error('x'));
		await p.catch(() => {});
		expect(readEntity(riva, 'Patient:9')).toBeUndefined();
	});
});

describe('aliases and arguments', () => {
	const aliased = query(ALIASED_QUERY, { cache, staleTime });
	const friends = (n: number) => ({
		me: {
			__typename: 'Patient',
			id: '1',
			label: 'Ada',
			friends: Array.from({ length: n }, (_, i) => ({
				__typename: 'Patient',
				id: String(i + 2),
			})),
		},
	});

	test('stored under the field name, read back under the response key', async () => {
		const { riva } = setup(() => friends(1));
		const data = await aliased.ensure(riva, { id: '1', n: 1 });
		expect(data.me.label).toBe('Ada');
		// The argument field is in the store; a plain `readEntity` leaves it out.
		expect(storeOfRiva(riva).peek('Patient:1')).toMatchObject({
			name: 'Ada',
			'friends({"first":1})': [{ __ref: 'Patient:2' }],
		});
		expect(storeOfRiva(riva).peek('Patient:1')).not.toHaveProperty('label');
		expect(readEntity(riva, 'Patient:1')).toEqual({
			__typename: 'Patient',
			id: '1',
			name: 'Ada',
		});
	});

	test('one stored field per argument set, both readable', async () => {
		const { riva } = setup((call) =>
			friends((call.variables as { n: number }).n),
		);
		await aliased.ensure(riva, { id: '1', n: 1 });
		await aliased.ensure(riva, { id: '1', n: 2 });
		const stored = storeOfRiva(riva).peek('Patient:1') ?? {};
		expect(stored['friends({"first":1})']).toHaveLength(1);
		expect(stored['friends({"first":2})']).toHaveLength(2);
		expect(riva.get(aliased, { id: '1', n: 1 }).data?.me.friends).toHaveLength(
			1,
		);
		expect(riva.get(aliased, { id: '1', n: 2 }).data?.me.friends).toHaveLength(
			2,
		);
	});

	test('readEntity and writeEntity see the entity under its field names', async () => {
		const { riva } = setup(() => friends(0));
		await aliased.ensure(riva, { id: '1', n: 0 });
		writeEntity(riva, 'Patient:1', { name: 'Ada L.' });
		expect(riva.get(aliased, { id: '1', n: 0 }).data?.me.label).toBe('Ada L.');
	});
});

describe('policy behaviours', () => {
	test('an evicted entity makes the query data missing', async () => {
		const { riva } = setup(answers({ ada: 'Ada' }));
		await patient.ensure(riva, { id: '1' });
		evict(riva, 'Patient:1');
		expect(riva.get(patient, { id: '1' }).data).toBeUndefined();
	});

	test('an evicted entity is refetched once an observer needs it', async () => {
		const { riva, transport } = setup(answers({ ada: 'Ada' }));
		await patient.ensure(riva, { id: '1' });
		const off = riva.subscribe(patient, { id: '1' }, () => {});
		evict(riva, 'Patient:1');
		await new Promise((r) => setTimeout(r, 20));
		expect(transport.calls.length).toBe(2);
		expect(riva.get(patient, { id: '1' }).data?.patient.name).toBe('Ada');
		off();
	});

	test('a server that omits a selected field ends in RIVA_CACHE, not a loop', async () => {
		const { riva, transport } = setup(() => ({
			patient: { __typename: 'Patient', id: '1' },
		}));
		const off = riva.subscribe(patient, { id: '1' }, () => {});
		await patient.ensure(riva, { id: '1' }).catch(() => {});
		await new Promise((r) => setTimeout(r, 50));
		const state = riva.get(patient, { id: '1' });
		expect(transport.calls.length).toBe(1);
		expect(state.status).toBe('error');
		expect((state.error as RivaError).code).toBe('RIVA_CACHE');
		off();
	});

	test('a document without __typename is refused when the query is defined', () => {
		const DOC = parse('query Bare { patient { id } }') as TypedDocumentNode<
			unknown,
			{ [k: string]: never }
		>;
		expect(() => query(DOC, { cache })).toThrow(/^riva-graphql: /);
	});

	test('keys override the identity, from the fields by name', async () => {
		const byMrn = normalized({
			keys: { Patient: (o) => o['mrn'] as string | undefined },
		});
		const DOC = parse(
			'query ByMrn { patient { __typename mrn name } }',
		) as TypedDocumentNode<
			{ patient: { mrn: string; name: string } },
			{ [k: string]: never }
		>;
		const { riva } = setup(() => ({
			patient: { __typename: 'Patient', mrn: '78', name: 'Ada' },
		}));
		await query(DOC, { cache: byMrn }).ensure(riva);
		expect(readEntity(riva, 'Patient:78')).toMatchObject({ name: 'Ada' });
	});

	test('possibleTypes decide a fragment on a union', async () => {
		const DOC = parse(
			'query Search { search { __typename ... on Patient { id name } ... on Doctor { id ward } } }',
		) as TypedDocumentNode<{ search: unknown[] }, { [k: string]: never }>;
		const data = {
			search: [
				{ __typename: 'Patient', id: '1', name: 'Ada' },
				{ __typename: 'Doctor', id: '2', ward: 'ER' },
			],
		};
		const { riva } = setup(() => data);
		const q = query(DOC, {
			cache: normalized({ possibleTypes: { Person: ['Patient', 'Doctor'] } }),
		});
		await q.ensure(riva);
		expect(riva.get(q).data).toEqual(data as never);
		expect(readEntity(riva, 'Doctor:2')).toEqual({
			__typename: 'Doctor',
			id: '2',
			ward: 'ER',
		});
	});

	test('data JSON cannot hold is refused as a RIVA_CACHE error state', async () => {
		const { riva } = setup(() => ({
			patient: { ...ada, born: new Date(0) },
		}));
		const DOC = parse(
			'query Born($id: ID!) { patient(id: $id) { __typename id born } }',
		) as TypedDocumentNode<{ patient: unknown }, { id: string }>;
		const q = query(DOC, { cache, retry: 0 });
		await q.ensure(riva, { id: '1' }).catch(() => {});
		const state = riva.get(q, { id: '1' });
		expect(state.status).toBe('error');
		expect(state.error).toBeInstanceOf(RivaError);
		expect((state.error as RivaError).code).toBe('RIVA_CACHE');
		expect(readEntity(riva, 'Patient:1')).toBeUndefined();
	});

	test('a core policy is still accepted as is', () => {
		const q = query(PATIENT_QUERY, {
			cache: {
				...cache.forOperation({
					document: PATIENT_QUERY,
					kind: 'query',
					name: 'Patient',
					id: 'Patient',
				}),
			},
		});
		expect(q.options.cache).toBeDefined();
	});
});

// Type tests only: nothing here runs.
const types = () => {
	expectTypeOf(patient).toEqualTypeOf<
		Query<{ id: string }, { patient: Named }>
	>();
	expectTypeOf(rename.run)
		.parameter(1)
		.toEqualTypeOf<{ id: string; name: string }>();
	expectTypeOf(rename.run).returns.resolves.toExtend<{
		renamePatient: { id: string };
	}>();
	const opts = normalized({ possibleTypes: { Node: ['Patient'] } });
	expectTypeOf(opts.forOperation).parameter(0).toHaveProperty('document');
};
const rejected = () => {
	// An operation cache binds a document; neither the core `query()` nor
	// `infinite()` has one to give it.
	coreQuery<{ id: string }, { patient: Named }>({
		id: 'x',
		fetch: async () => ({ patient: ada }),
		// @ts-expect-error an OperationCache is not a core CachePolicy
		cache,
	});
	infinite(PATIENTS_QUERY, {
		connection: () => ({}) as never,
		// @ts-expect-error an OperationCache is not accepted by infinite()
		cache,
	});
	// @ts-expect-error a cache option is a policy or an operation cache
	query(PATIENT_QUERY, { cache: 'normalized' });
};
void types;
void rejected;
void (null as unknown as Riva);
