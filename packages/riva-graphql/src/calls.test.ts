/* biome-ignore-all lint/style/useNamingConvention: GraphQL's field names */
import { expect, test } from 'bun:test';
import { createRiva } from '@softistx/riva';
import {
	fakeTransport,
	RENAME_PATIENT_MUTATION,
	VIEWER_QUERY,
} from '../test/fixtures';
import { callsOf } from './calls';
import { query } from './query';
import { provideGraphQL } from './transport';

const setup = () => {
	const t = fakeTransport((c) =>
		c.kind === 'mutation'
			? { renamePatient: { id: '1', name: 'A' } }
			: { viewer: { id: '1' } },
	);
	const riva = createRiva();
	provideGraphQL(riva, t);
	return { t, riva, calls: callsOf(riva, undefined) };
};

test('query awaits the data and shares one definition per document', async () => {
	const { t, calls } = setup();
	await calls.query(VIEWER_QUERY as never, undefined, { staleTime: '1m' });
	await calls.query(VIEWER_QUERY as never, undefined, { staleTime: '1m' });
	expect(t.calls).toHaveLength(1);
});

test('mutate invalidates after success and resolves the invalidates first', async () => {
	const { t, calls } = setup();
	await calls.query(VIEWER_QUERY as never, undefined, { staleTime: '1h' });
	await calls.mutate(
		RENAME_PATIENT_MUTATION as never,
		{ id: '1', name: 'A' },
		{ invalidates: [VIEWER_QUERY as never] },
	);
	await calls.query(VIEWER_QUERY as never, undefined, { staleTime: '1h' });
	expect(t.calls.filter((c) => c.kind === 'query')).toHaveLength(2);
});

test('mutation makes a handle with its own state', async () => {
	const { calls } = setup();
	const save = calls.mutation(RENAME_PATIENT_MUTATION as never);
	expect(save.state.status).toBe('idle');
	await save({ id: '1', name: 'A' });
	expect(save.state.status).toBe('success');
	expect(calls.mutation(RENAME_PATIENT_MUTATION as never)).not.toBe(save);
});

test('a definition is used as is: a loader ensure and the call share one entry, and invalidates marks it stale', async () => {
	const { t, riva, calls } = setup();
	const def = query(VIEWER_QUERY as never) as never;
	await (def as { ensure(r: unknown): Promise<unknown> }).ensure(riva);
	await calls.query(def, undefined, { staleTime: '1h' });
	expect(t.calls).toHaveLength(1);
	await calls.mutate(
		RENAME_PATIENT_MUTATION as never,
		{ id: '1', name: 'A' },
		{ invalidates: [def] },
	);
	await calls.query(def, undefined, { staleTime: '1h' });
	expect(t.calls.filter((c) => c.kind === 'query')).toHaveLength(2);
});
