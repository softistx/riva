import { expect, test } from 'bun:test';
import { createRiva } from '@softistx/riva';
import { fakeTransport, PATIENTS_QUERY } from '../test/fixtures';
import { operationOf } from './operation';
import { fetchOf } from './run';
import { provideGraphQL } from './transport';

test('fetches through the transport of the context riva, with its signal', async () => {
	const riva = createRiva();
	const t = fakeTransport(() => ({ ok: true }));
	provideGraphQL(riva, t);
	const ctl = new AbortController();
	const out = await fetchOf(operationOf(PATIENTS_QUERY))(
		{ school: 's' },
		{ riva, signal: ctl.signal },
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
	const riva = createRiva();
	await expect(
		fetchOf(operationOf(PATIENTS_QUERY))(
			{ school: 's' },
			{ riva, signal: new AbortController().signal },
		),
	).rejects.toThrow(/provideGraphQL/);
});
