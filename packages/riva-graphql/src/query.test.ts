/* biome-ignore-all lint/style/useNamingConvention: GraphQL's __typename */
import { expect, test } from 'bun:test';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { createRiva, RivaRequestError } from '@softistx/riva';
import { parse } from 'graphql';
import {
	fakeTransport,
	PATIENTS_QUERY,
	RENAME_PATIENT_MUTATION,
	VIEWER_QUERY,
} from '../test/fixtures';
import { normalized } from './cache';
import { mutation, query } from './query';
import { provideGraphQL } from './transport';

const setup = (answer?: Parameters<typeof fakeTransport>[0]) => {
	const riva = createRiva();
	const transport = fakeTransport(answer);
	provideGraphQL(riva, transport);
	return { riva, transport };
};

test('a query takes its id from the document and fetches through the transport', async () => {
	const patients = query(PATIENTS_QUERY, { staleTime: '30s' });
	expect(patients.id).toBe('Patients');
	expect(patients.options.staleTime).toBe(30_000);
	const { riva, transport } = setup(() => ({ patients: 1 }));
	await expect(patients.ensure(riva, { school: 's' })).resolves.toEqual({
		patients: 1,
	} as never);
	expect(transport.calls).toHaveLength(1);
	expect(transport.calls[0]).toMatchObject({
		name: 'Patients',
		kind: 'query',
		variables: { school: 's' },
	});
	await patients.ensure(riva, { school: 's' });
	expect(transport.calls).toHaveLength(1);
});

test('a query with no variables takes none', async () => {
	const viewer = query(VIEWER_QUERY);
	const { riva, transport } = setup(() => ({ viewer: { id: '1' } }));
	await viewer.ensure(riva);
	expect(transport.calls).toHaveLength(1);
});

test('the id may be replaced, for two definitions of one document', () => {
	expect(query(PATIENTS_QUERY, { id: 'patients/fast' }).id).toBe(
		'patients/fast',
	);
});

test('a query refuses a mutation document and a mutation a query', () => {
	expect(() => query(RENAME_PATIENT_MUTATION as never)).toThrow(/mutation/);
	expect(() => mutation(PATIENTS_QUERY as never)).toThrow(/query/);
});

test('a document with no name is refused at definition time', () => {
	expect(() => query(parse('{ a }') as TypedDocumentNode)).toThrow(/no name/);
});

test('a definition with no transport rejects naming provideGraphQL', async () => {
	const riva = createRiva();
	await expect(query(VIEWER_QUERY, { retry: 0 }).ensure(riva)).rejects.toThrow(
		/provideGraphQL/,
	);
});

test('retries a retryable error, never a refusal', async () => {
	const calls = (retryable: boolean) => {
		const { riva, transport } = setup(() => {
			throw new RivaRequestError('X', 'no', { retryable });
		});
		return query(VIEWER_QUERY, { retry: 2, retryDelay: () => 0 })
			.ensure(riva)
			.catch(() => transport.calls.length);
	};
	expect(await calls(true)).toBe(3);
	expect(await calls(false)).toBe(1);
});

test('aborting cancels the transport call', async () => {
	const { riva, transport } = setup(
		(c) => new Promise(() => c.signal.addEventListener('abort', () => {})),
	);
	const viewer = query(VIEWER_QUERY, { retry: 0 });
	const ctl = new AbortController();
	const p = viewer.ensure(riva, undefined, { signal: ctl.signal });
	await Promise.resolve();
	ctl.abort();
	await expect(p).rejects.toThrow();
	expect(transport.calls[0]?.signal.aborted).toBe(true);
});

test('a mutation runs through the transport, with optimistic and invalidates', async () => {
	const patients = query(PATIENTS_QUERY);
	const rename = mutation(RENAME_PATIENT_MUTATION, {
		invalidates: [patients],
	});
	expect(rename.id).toBe('RenamePatient');
	const { riva, transport } = setup((c) =>
		c.kind === 'mutation'
			? { renamePatient: { id: '1', name: 'New' } }
			: { patients: 1 },
	);
	await rename.mutate(riva, { id: '1', name: 'New' });
	expect(transport.calls[0]).toMatchObject({
		name: 'RenamePatient',
		kind: 'mutation',
		variables: { id: '1', name: 'New' },
	});
});

const PROFILE_QUERY = parse(
	'query Profile { me { __typename id ... @defer { name } } }',
) as TypedDocumentNode<
	{ me: { __typename: 'User'; id: string; name: string } },
	{ [key: string]: never }
>;

/** A transport that publishes a part, then waits for the test to finish the query. */
const streamingTransport = () => {
	let finish!: (data: unknown) => void;
	let part!: (data: unknown) => void;
	let signal!: AbortSignal;
	return {
		part: (d: unknown) => part(d),
		finish: (d: unknown) => finish(d),
		signal: () => signal,
		transport: {
			execute: (_op: unknown, _vars: unknown, opts: never) => {
				const o = opts as {
					signal: AbortSignal;
					onPart?: (d: unknown) => void;
				};
				signal = o.signal;
				part = (d) => o.onPart?.(d);
				return new Promise((r) => {
					finish = r;
				});
			},
		} as never,
	};
};

test('a query renders each part from the transport, then the final data', async () => {
	const profile = query(PROFILE_QUERY);
	const riva = createRiva();
	const s = streamingTransport();
	provideGraphQL(riva, s.transport);
	const done = profile.ensure(riva);
	s.part({ me: { __typename: 'User', id: '1' } });
	expect(riva.get(profile)).toMatchObject({
		status: 'success',
		dataState: 'streaming',
		isFetching: true,
		data: { me: { id: '1' } },
	});
	const final = { me: { __typename: 'User', id: '1', name: 'Ada' } };
	s.finish(final);
	expect(await done).toEqual(final as never);
	expect(riva.get(profile)).toMatchObject({
		dataState: 'complete',
		isFetching: false,
		data: final,
	});
});

test('with normalized(), each part is merged into the cache and reads back', async () => {
	const profile = query(PROFILE_QUERY, { cache: normalized() });
	const riva = createRiva();
	const s = streamingTransport();
	provideGraphQL(riva, s.transport);
	const done = profile.ensure(riva);
	s.part({ me: { __typename: 'User', id: '1' } });
	expect(riva.get(profile)).toMatchObject({
		status: 'success',
		dataState: 'streaming',
		data: { me: { __typename: 'User', id: '1' } },
	});
	const final = { me: { __typename: 'User', id: '1', name: 'Ada' } };
	s.part(final);
	expect(riva.get(profile).data).toEqual(final as never);
	s.finish(final);
	await done;
	expect(riva.get(profile)).toMatchObject({
		dataState: 'complete',
		data: final,
	});
});

test('cancel closes the request through the entry signal', async () => {
	const profile = query(PROFILE_QUERY);
	const riva = createRiva();
	const s = streamingTransport();
	provideGraphQL(riva, s.transport);
	const settled = profile.ensure(riva).catch((e) => e);
	s.part({ me: { __typename: 'User', id: '1' } });
	profile.cancel(riva);
	await settled;
	expect(s.signal().aborted).toBe(true);
	expect(riva.get(profile).status).toBe('idle');
});

test('a plain query never gets dataState or onPart through a custom transport', async () => {
	const patients = query(PATIENTS_QUERY);
	const { riva } = setup(() => ({ patients: 1 }));
	await patients.ensure(riva, { school: 's' });
	expect('dataState' in riva.get(patients, { school: 's' })).toBe(false);
});
