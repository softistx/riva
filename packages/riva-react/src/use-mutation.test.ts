import { expect, spyOn, test } from 'bun:test';
import { mutation } from '@softistx/riva';
import { act } from 'react';
import { deferred, h, mount, newClient } from '../test/render';
import { type MutationResult, useMutation } from './use-mutation';

type Rename = MutationResult<{ id: string; name: string }, string>;

function setup(run: (v: { id: string; name: string }) => Promise<string>) {
	const def = mutation<{ id: string; name: string }, string>({
		id: `um/${Math.random()}`,
		run,
	});
	const box: { m?: Rename; renders: number } = { renders: 0 };
	function C() {
		const m = useMutation(def);
		box.m = m;
		box.renders++;
		return h('p', null, `${m.status}:${m.data ?? '-'}:${m.isPending}`);
	}
	return [box, C] as const;
}

test('status flows idle, pending, success with the data', async () => {
	const gate = deferred<string>();
	const [box, C] = setup(() => gate.promise);
	const m = await mount(h(C), newClient());
	expect(m.text()).toBe('idle:-:false');
	let result!: Promise<string>;
	await act(async () => {
		result = box.m?.run({ id: '1', name: 'a' }) as Promise<string>;
	});
	expect(m.text()).toBe('pending:-:true');
	await act(async () => gate.resolve('done'));
	expect(await result).toBe('done');
	expect(m.text()).toBe('success:done:false');
	await act(async () => box.m?.reset());
	expect(m.text()).toBe('idle:-:false');
	await m.unmount();
});

test('a rejection sets the error and rejects the run', async () => {
	const [box, C] = setup(() => Promise.reject(new Error('refused')));
	const m = await mount(h(C), newClient());
	let caught: unknown;
	await act(async () => {
		await box.m?.run({ id: '1', name: 'a' }).catch((e) => {
			caught = e;
		});
	});
	expect((caught as Error).message).toBe('refused');
	expect(box.m?.status).toBe('error');
	expect(((box.m as Rename).error as Error).message).toBe('refused');
	await m.unmount();
});

test('the latest run owns the state', async () => {
	const gates = [deferred<string>(), deferred<string>()];
	let n = 0;
	const [box, C] = setup(
		() => (gates[n++] as ReturnType<typeof deferred<string>>).promise,
	);
	const m = await mount(h(C), newClient());
	await act(async () => {
		void box.m?.run({ id: '1', name: 'a' });
		void box.m?.run({ id: '1', name: 'b' });
	});
	await act(async () => gates[1]?.resolve('second'));
	await act(async () => gates[0]?.resolve('first'));
	expect(m.text()).toBe('success:second:false');
	await m.unmount();
});

test('a run finishes after unmount with no state update and no warning', async () => {
	const gate = deferred<string>();
	let finished = false;
	const [box, C] = setup(async () => {
		const v = await gate.promise;
		finished = true;
		return v;
	});
	const error = spyOn(console, 'error').mockImplementation(() => {});
	const m = await mount(h(C), newClient());
	const rendersBefore = box.renders;
	let result!: Promise<string>;
	await act(async () => {
		result = box.m?.run({ id: '1', name: 'a' }) as Promise<string>;
	});
	const rendersPending = box.renders;
	await m.unmount();
	gate.resolve('late');
	expect(await result).toBe('late');
	expect(finished).toBe(true);
	expect(box.renders).toBe(rendersPending);
	expect(rendersPending).toBeGreaterThan(rendersBefore);
	expect(error).not.toHaveBeenCalled();
	error.mockRestore();
});

test('run and reset keep their identity across renders', async () => {
	const [box, C] = setup(async () => 'x');
	const m = await mount(h(C), newClient());
	const { run, reset } = box.m as Rename;
	await act(async () => void box.m?.run({ id: '1', name: 'a' }));
	expect(box.m?.run).toBe(run);
	expect(box.m?.reset).toBe(reset);
	await m.unmount();
});
