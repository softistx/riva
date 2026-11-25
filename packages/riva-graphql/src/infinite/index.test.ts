import { expect, expectTypeOf, test } from 'bun:test';
import { createRiva } from '@softistx/riva';
import {
	fakeTransport,
	PATIENTS_QUERY,
	type Patient,
	page,
	RENAME_PATIENT_MUTATION,
} from '../../test/fixtures';
import { query } from '../query';
import { provideGraphQL } from '../transport';
import { infinite } from './index';

const feed = infinite(PATIENTS_QUERY, {
	connection: (d) => d.patients,
	retry: 0,
});

test('infers the vars (without the cursors) and the node type', () => {
	type FeedVars = Parameters<typeof feed.fetchNext>[1];
	expectTypeOf<FeedVars>().toEqualTypeOf<{
		school: string;
		first?: number | null;
	}>();
	const riva = createRiva();
	const state = riva.get(feed, { school: 's' });
	expectTypeOf(state.data?.nodes).toEqualTypeOf<Patient[] | undefined>();
});

test('has its own id, apart from a query of the same document', () => {
	expect(feed.id).toBe('Patients#infinite');
	expect(query(PATIENTS_QUERY).id).toBe('Patients');
	expect(
		infinite(PATIENTS_QUERY, { id: 'x', connection: (d) => d.patients }).id,
	).toBe('x');
});

test('pages through the transport with the cursor merged into the variables', async () => {
	const riva = createRiva();
	const t = fakeTransport(({ variables }) => ({
		patients: (variables as { after?: string }).after
			? page(['3', '4'], null)
			: page(['1', '2'], 'c2'),
	}));
	provideGraphQL(riva, t);
	const first = await feed.ensure(riva, { school: 's', first: 2 });
	expect(first.nodes.map((n) => n.id)).toEqual(['1', '2']);
	await feed.fetchNext(riva, { school: 's', first: 2 });
	expect(
		riva.get(feed, { school: 's', first: 2 }).data?.nodes.map((n) => n.id),
	).toEqual(['1', '2', '3', '4']);
	expect(t.calls.map((c) => c.variables)).toEqual([
		{ school: 's', first: 2 },
		{ school: 's', first: 2, after: 'c2' },
	]);
	expect(riva.get(feed, { school: 's', first: 2 }).hasNext).toBe(false);
});

test('a document of two operations is refused at definition time', () => {
	expect(() =>
		infinite({ definitions: [] } as never, { connection: () => ({}) as never }),
	).toThrow(/no operation/);
});

test('a mutation document is refused', () => {
	expect(() =>
		infinite(RENAME_PATIENT_MUTATION, { connection: () => ({}) as never }),
	).toThrow(/use mutation\(\)/);
});
