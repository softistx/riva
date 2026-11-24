import { expect, test } from 'bun:test';
import { createRivaClient } from '@softistx/riva';
import { fakeTransport, PATIENTS_QUERY } from '../test/fixtures';
import { operationOf } from './operation';
import { fetchOf } from './run';
import { provideGraphQL } from './transport';

test('fetches through the transport of the context client, with its signal', async () => {
	const client = createRivaClient();
	const t = fakeTransport(() => ({ ok: true }));
	provideGraphQL(client, t);
	const ctl = new AbortController();
	const out = await fetchOf(operationOf(PATIENTS_QUERY))(
		{ school: 's' },
		{ client, signal: ctl.signal },
	);
	expect(out as unknown).toEqual({ ok: true });
	expect(t.calls[0]).toMatchObject({
		name: 'Patients',
		kind: 'query',
		variables: { school: 's' },
		signal: ctl.signal,
	});
});

test('rejects without a transport', async () => {
	const client = createRivaClient();
	await expect(
		fetchOf(operationOf(PATIENTS_QUERY))(
			{ school: 's' },
			{ client, signal: new AbortController().signal },
		),
	).rejects.toThrow(/provideGraphQL/);
});
