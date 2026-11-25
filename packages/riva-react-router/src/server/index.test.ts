import { expect, spyOn, test } from 'bun:test';
import { createRiva, RivaScopeError } from '@softistx/riva';
import { RouterContextProvider } from 'react-router';
import { counter, errorsOf, fakeApi, makeApp, sleep } from '../../test/app';
import { rivaContext } from '../context';
import { rivaMiddleware } from './index';

test('one riva per request, none shared between two parallel requests', async () => {
	const app = makeApp();
	const [a, b] = await Promise.all([
		app.serve('/patients'),
		app.serve('/patients/2'),
	]);
	expect(a.riva).not.toBeNull();
	expect(b.riva).not.toBeNull();
	expect(a.riva).not.toBe(b.riva);
	expect(a.html).toContain('Patients:s');
	expect(b.html).toContain('Patient:2');
	expect(a.html).not.toContain('Patient:2');
});

test('the ambient scope follows a loader across awaits, per request', async () => {
	const app = makeApp({
		onPatient: async (id) => {
			await sleep(id === '1' ? 10 : 2);
			counter.set(Number(id));
		},
	});
	const [a, b] = await Promise.all([
		app.serve('/patients/1'),
		app.serve('/patients/2'),
	]);
	expect(a.riva?.get(counter)).toBe(1);
	expect(b.riva?.get(counter)).toBe(2);
});

test('outside a request an ambient read still throws', () => {
	expect(() => counter.get()).toThrow(RivaScopeError);
});

test('the middleware refuses to run twice in one request', async () => {
	const mw = rivaMiddleware();
	const context = new RouterContextProvider();
	context.set(rivaContext, createRiva());
	const args = { request: new Request('http://x'), context, params: {} };
	await expect(
		mw(args as never, (async () => new Response()) as never),
	).rejects.toThrow(
		'rivaMiddleware ran twice in one request: declare it once, on the root route.',
	);
});

test('create and setup shape the request riva before the loaders', async () => {
	const made = createRiva();
	const order: string[] = [];
	const mw = rivaMiddleware({
		create: () => made,
		setup: async (riva, { request }) => {
			await sleep(1);
			order.push(`setup:${riva === made}:${new URL(request.url).pathname}`);
		},
	});
	const context = new RouterContextProvider();
	const res = await mw(
		{ request: new Request('http://x/p'), context, params: {} } as never,
		(async () => {
			order.push('next');
			return new Response('ok');
		}) as never,
	);
	expect(order).toEqual(['setup:true:/p', 'next']);
	expect((res as Response).status).toBe(200);
	expect(context.get(rivaContext)).toBe(made);
});

test('serving makes one loader fetch and no console error', async () => {
	const spy = spyOn(console, 'error').mockImplementation(() => {});
	const app = makeApp({ server: fakeApi() });
	await app.serve('/patients');
	expect(app.server.calls).toEqual(['Patients']);
	expect(errorsOf(spy)).toEqual([]);
	spy.mockRestore();
});
