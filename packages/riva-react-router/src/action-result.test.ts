import { expect, test } from 'bun:test';
import { useClient, useQuery } from '@softistx/riva-react';
import { createElement as h, type ReactElement } from 'react';
import { Form, useActionData, useFetcher } from 'react-router';
import { PATIENTS } from '../test/app';
import { makeDataApp } from '../test/data-app';
import { useActionResult } from './action-result';

const SCHOOL = { school: 's' };
type Result = { label: string } | { error: string };

function shown(): ReactElement {
	const q = useQuery(PATIENTS, SCHOOL);
	return h('p', { id: 'patients' }, `${q.data?.label} #${q.data?.rev}`);
}

test('the browser reads through /_data with the session, as Dates and all', async () => {
	const app = makeDataApp();
	const page = await app.boot(app.Patients);
	expect(page.text('#patients')).toBe('Patients:s #1');
	expect(app.api).toEqual([{ name: 'Patients', session: 'abc' }]);
	const entry = app.client().get(PATIENTS, SCHOOL);
	const data = entry.data as unknown as { at: Date };
	expect(data.at).toBeInstanceOf(Date);
	await page.unmount();
});

test('useActionData feeds a query entry through select, with no fetch', async () => {
	const app = makeDataApp({
		onAction: (form) =>
			form.get('name') === ''
				? { error: 'name is required' }
				: { label: String(form.get('name')) },
	});
	const page = await app.boot(() => {
		const result = useActionData<Result>();
		useActionResult(result, {
			into: PATIENTS,
			vars: SCHOOL,
			select: (r) => ('label' in r ? { rev: 99, label: r.label } : undefined),
		});
		return h(
			Form,
			{ method: 'post' },
			h(shown),
			h('input', { name: 'name', defaultValue: 'Ada' }),
			h('button', { id: 'go', type: 'submit' }, 'go'),
		);
	});
	await page.click('#go');
	expect(page.text('#patients')).toBe('Ada #99');
	expect(app.api.length).toBe(1);
	await page.unmount();
});

test('a result that selects undefined writes nothing', async () => {
	const app = makeDataApp({ onAction: () => ({ error: 'no' }) });
	const page = await app.boot(() => {
		const result = useActionData<Result>();
		useActionResult(result, {
			into: PATIENTS,
			vars: SCHOOL,
			select: (r) => ('label' in r ? { rev: 99, label: r.label } : undefined),
		});
		return h(
			Form,
			{ method: 'post' },
			h(shown),
			h('button', { id: 'go', type: 'submit' }, 'go'),
		);
	});
	await page.click('#go');
	expect(page.text('#patients')).toBe('Patients:s #1');
	await page.unmount();
});

test('a fetcher result works the same, and each result is written once', async () => {
	const app = makeDataApp({
		onAction: (form) => ({ rev: 7, label: String(form.get('name')) }),
	});
	const page = await app.boot(() => {
		const fetcher = useFetcher<{ rev: number; label: string }>();
		const client = useClient();
		// The result is the data: no select needed.
		useActionResult(fetcher.data, { into: PATIENTS, vars: SCHOOL });
		return h(
			'div',
			null,
			h(shown),
			h(
				'button',
				{
					id: 'go',
					type: 'button',
					onClick: () => fetcher.submit({ name: 'Grace' }, { method: 'post' }),
				},
				'go',
			),
			h(
				'button',
				{
					id: 'local',
					type: 'button',
					onClick: () =>
						PATIENTS.setData(client, SCHOOL, { rev: 1, label: 'local' }),
				},
				'local',
			),
		);
	});
	await page.click('#go');
	expect(page.text('#patients')).toBe('Grace #7');
	await page.click('#local');
	// The same fetcher.data object is not written again by a re-render.
	expect(page.text('#patients')).toBe('local #1');
	await page.unmount();
});
