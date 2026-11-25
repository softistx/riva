import { expect, spyOn, test } from 'bun:test';
import { createRivaClient, type RivaClient } from '@softistx/riva';
import { useClient } from '@softistx/riva-react';
import { act, createElement as h, StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { counter, errorsOf, local, makeApp, seen } from '../test/app';
import { RivaRouterProvider } from './provider';

test('the server HTML holds the data and the server makes one fetch', async () => {
	const app = makeApp();
	const { html } = await app.serve('/patients');
	expect(html).toContain('Patients:s #1');
	expect(app.server.calls).toEqual(['Patients']);
});

test('the server render takes the server branch of the provider and never fetches in the browser', async () => {
	const app = makeApp();
	await app.serve('/patients');
	expect(app.envs).toEqual([true]);
	expect(app.browser.calls).toEqual([]);
	expect(typeof document).toBe('object');
});

test('the browser boots from the loader data with no fetch while it is fresh', async () => {
	const app = makeApp();
	const { loaderData } = await app.serve('/patients');
	const page = await app.boot('/patients', loaderData);
	expect(page.text('#patients')).toBe('Patients:s #1');
	expect(app.browser.calls).toEqual([]);
	await page.unmount();
});

test('a navigation merges the child snapshot with no browser fetch', async () => {
	const app = makeApp();
	const { loaderData } = await app.serve('/patients');
	const page = await app.boot('/patients', loaderData);
	await page.go('/patients/1');
	expect(page.text('#patient')).toBe('Patient:1 #2');
	expect(app.browser.calls).toEqual([]);
	await page.unmount();
});

test('a revalidation updates observed entries without a setState-in-render warning', async () => {
	const spy = spyOn(console, 'error').mockImplementation(() => {});
	const app = makeApp();
	const { loaderData } = await app.serve('/patients');
	const page = await app.boot('/patients', loaderData);
	await page.revalidate();
	expect(page.text('#patients')).toBe('Patients:s #2');
	expect(app.browser.calls).toEqual([]);
	expect(errorsOf(spy)).toEqual([]);
	spy.mockRestore();
	await page.unmount();
});

test('a named signal is seeded once and a local signal survives a navigation', async () => {
	const app = makeApp({ onPatient: (id) => counter.set(Number(id) + 3) });
	const { loaderData } = await app.serve('/patients/2');
	const page = await app.boot('/patients/2', loaderData);
	const client = seen.client as RivaClient;
	expect(client.get(counter)).toBe(5);
	client.set(counter, 9);
	client.set(local, 'typed');
	await page.go('/patients/3');
	expect(page.text('#patient')).toBe('Patient:3 #2');
	expect(client.get(counter)).toBe(9);
	expect(client.get(local)).toBe('typed');
	await page.unmount();
});

async function strict(app: ReturnType<typeof makeApp>, url: string) {
	const { loaderData } = await app.serve(url);
	const router = createMemoryRouter(app.browserRoutes, {
		initialEntries: [url],
		hydrationData: { loaderData },
	});
	const container = document.createElement('div');
	document.body.append(container);
	const dom = createRoot(container);
	await act(async () =>
		dom.render(h(StrictMode, null, h(RouterProvider, { router }))),
	);
	return {
		router,
		text: (selector: string) =>
			container.querySelector(selector)?.textContent ?? '',
		settle: (run: () => Promise<unknown>) =>
			act(async () => {
				await run();
				await new Promise((r) => setTimeout(r, 5));
			}),
		unmount: async () => {
			await act(async () => dom.unmount());
			container.remove();
		},
	};
}

test('under React StrictMode the page shows the loader data with no browser fetch', async () => {
	const app = makeApp();
	const page = await strict(app, '/patients');
	expect(page.text('#patients')).toBe('Patients:s #1');
	expect(app.browser.calls).toEqual([]);
	await page.unmount();
});

test('under React StrictMode a navigation and a revalidation still merge without a browser fetch', async () => {
	const spy = spyOn(console, 'error').mockImplementation(() => {});
	const app = makeApp();
	const page = await strict(app, '/patients');
	await page.settle(() => page.router.navigate('/patients/1'));
	expect(page.text('#patient')).toBe('Patient:1 #2');
	await page.settle(() => page.router.revalidate());
	expect(page.text('#patient')).toBe('Patient:1 #3');
	expect(app.browser.calls).toEqual([]);
	expect(errorsOf(spy)).toEqual([]);
	spy.mockRestore();
	await page.unmount();
});

test('hydrating the server HTML reports no mismatch', async () => {
	const errors: unknown[] = [];
	const spy = spyOn(console, 'error').mockImplementation(() => {});
	const app = makeApp();
	const { html, loaderData } = await app.serve('/patients');
	const router = createMemoryRouter(app.browserRoutes, {
		initialEntries: ['/patients'],
		hydrationData: { loaderData },
	});
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.append(container);
	let root: ReturnType<typeof hydrateRoot> | undefined;
	await act(async () => {
		root = hydrateRoot(container, h(RouterProvider, { router }), {
			onRecoverableError: (e) => errors.push(e),
		});
	});
	expect(errors).toEqual([]);
	expect(errorsOf(spy)).toEqual([]);
	expect(container.querySelector('#patients')?.textContent).toBe(
		'Patients:s #1',
	);
	expect(app.browser.calls).toEqual([]);
	spy.mockRestore();
	await act(async () => root?.unmount());
	container.remove();
});

test('a given client is used, and setup runs once with the environment', async () => {
	const given = createRivaClient();
	const envs: boolean[] = [];
	const Probe = () => {
		seen.client = useClient();
		return null;
	};
	const container = document.createElement('div');
	document.body.append(container);
	const dom = createRoot(container);
	const router = createMemoryRouter([
		{
			path: '/',
			// biome-ignore lint/style/useNamingConvention: React Router's route property
			Component: () =>
				h(
					RivaRouterProvider,
					{ client: given, setup: (_c, env) => envs.push(env.server) },
					h(Probe),
				),
		},
	]);
	await act(async () => dom.render(h(RouterProvider, { router })));
	expect(seen.client).toBe(given);
	expect(envs).toEqual([false]);
	await act(async () => dom.unmount());
	container.remove();
});
