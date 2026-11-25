import { expect, test } from 'bun:test';
import { createElement as h } from 'react';
import { Form, useFetcher } from 'react-router';
import { PATIENTS, sleep } from '../test/app';
import { makeDataApp } from '../test/data-app';

const page = (app: ReturnType<typeof makeDataApp>) => () =>
	h(
		Form,
		{ method: 'post' },
		h(app.Patients),
		h('button', { id: 'go', type: 'submit' }, 'go'),
	);

test('a settled form submission invalidates the listed queries, and the observed one refetches', async () => {
	const app = makeDataApp({ provider: { invalidateOnAction: [PATIENTS] } });
	const view = await app.boot(page(app));
	expect(app.api.length).toBe(1);
	await view.click('#go');
	await sleep(30);
	expect(app.api.length).toBe(2);
	expect(view.text('#patients')).toBe('Patients:s #2');
	await view.unmount();
});

test('a settled fetcher write invalidates too, a fetcher read does not', async () => {
	const app = makeDataApp({ provider: { invalidateOnAction: [PATIENTS] } });
	const view = await app.boot(() => {
		const fetcher = useFetcher();
		return h(
			'div',
			null,
			h(app.Patients),
			h(
				'button',
				{ id: 'read', type: 'button', onClick: () => fetcher.load('/other') },
				'read',
			),
			h(
				'button',
				{
					id: 'write',
					type: 'button',
					onClick: () => fetcher.submit({ a: '1' }, { method: 'post' }),
				},
				'write',
			),
		);
	});
	await view.click('#read');
	await sleep(30);
	expect(app.api.length).toBe(1);
	await view.click('#write');
	await sleep(30);
	expect(app.api.length).toBe(2);
	await view.unmount();
});

test('a navigation with no submission invalidates nothing', async () => {
	const app = makeDataApp({ provider: { invalidateOnAction: [PATIENTS] } });
	const view = await app.boot(page(app));
	await view.go('/other');
	await view.go('/');
	expect(app.api.length).toBe(1);
	await view.unmount();
});

test('with nothing listed a submission leaves the queries alone', async () => {
	const app = makeDataApp();
	const view = await app.boot(page(app));
	await view.click('#go');
	await sleep(30);
	expect(app.api.length).toBe(1);
	await view.unmount();
});
