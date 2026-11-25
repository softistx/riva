import { expect, test } from 'bun:test';
import { createRiva, mutation, RivaScopeError } from '@softistx/riva';
import { makeDataApp, settle } from '../test/data-app';
import { revalidate } from './revalidate';

test('a mutation that invalidates revalidate reruns the route loaders once', async () => {
	const app = makeDataApp();
	const page = await app.boot(app.Patients);
	expect(app.loads()).toBe(1);
	const save = mutation({
		id: 'save',
		run: async () => 'ok',
		invalidates: [revalidate],
	});
	await settle(40, () => save.run(app.riva()));
	expect(app.loads()).toBe(2);
	await page.unmount();
});

test('several invalidations in one tick make one run', async () => {
	const app = makeDataApp();
	const page = await app.boot(app.Patients);
	const riva = app.riva();
	await settle(40, () => {
		riva.batch(() => {
			revalidate.invalidate(riva);
			revalidate.invalidate(riva);
		});
		revalidate.invalidate(riva);
	});
	expect(app.loads()).toBe(2);
	await page.unmount();
});

test('the data counts the runs', async () => {
	const app = makeDataApp();
	const page = await app.boot(app.Patients);
	const riva = app.riva();
	expect(riva.get(revalidate)?.data).toBe(0);
	await settle(40, () => revalidate.invalidate(riva));
	await settle(40, () => revalidate.invalidate(riva));
	expect(riva.get(revalidate)?.data).toBe(2);
	await page.unmount();
});

test('revalidate does not refetch the queries by itself, only the loaders', async () => {
	const app = makeDataApp();
	const page = await app.boot(app.Patients);
	await settle(40, () => revalidate.invalidate(app.riva()));
	expect(app.api.length).toBe(1);
	await page.unmount();
});

test('without the provider it throws the scope error naming RivaRouterProvider', async () => {
	await expect(revalidate.ensure(createRiva())).rejects.toThrow(
		new RivaScopeError(
			'revalidate is observed by RivaRouterProvider: render it above the component that invalidates it.',
		),
	);
});

test('after the provider unmounts the revalidator is gone', async () => {
	const app = makeDataApp();
	const page = await app.boot(app.Patients);
	const riva = app.riva();
	await page.unmount();
	revalidate.invalidate(riva);
	await expect(revalidate.ensure(riva)).rejects.toBeInstanceOf(RivaScopeError);
});
