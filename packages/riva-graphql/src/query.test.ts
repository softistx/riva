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
