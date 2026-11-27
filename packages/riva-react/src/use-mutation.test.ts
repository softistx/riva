import { expect, spyOn, test } from 'bun:test';
import { mutation } from '@softistx/riva';
import { act } from 'react';
import { deferred, h, mount, newRiva } from '../test/render';
import { type MutationResult, useMutation } from './use-mutation';

type Rename = MutationResult<{ id: string; name: string }, string>;

function setup(mutate: (v: { id: string; name: string }) => Promise<string>) {
	const def = mutation<{ id: string; name: string }, string>({
		id: `um/${Math.random()}`,
		mutate,
	});
	const box: { m?: Rename; renders: number } = { renders: 0 };
	function C() {
		const m = useMutation(def);
		box.m = m;
		box.renders++;
		return h('p', null, `${m.status}:${m.data ?? '-'}`);
	}
	return [box, C] as const;
}

test('status flows idle, loading, success with the data', async () => {
	const gate = deferred<string>();
	const [box, C] = setup(() => gate.promise);
	const m = await mount(h(C), newRiva());
	expect(m.text()).toBe('idle:-');
	let result!: Promise<string>;
	await act(async () => {
		result = box.m?.mutate({ id: '1', name: 'a' }) as Promise<string>;
	});
	expect(m.text()).toBe('loading:-');
	await act(async () => gate.resolve('done'));
	expect(await result).toBe('done');
	expect(m.text()).toBe('success:done');
	await act(async () => box.m?.reset());
	expect(m.text()).toBe('idle:-');
	await m.unmount();
});

test('a rejection sets the error and rejects the run', async () => {
	const [box, C] = setup(() => Promise.reject(new Error('refused')));
	const m = await mount(h(C), newRiva());
	let caught: unknown;
	await act(async () => {
		await box.m?.mutate({ id: '1', name: 'a' }).catch((e) => {
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
	const m = await mount(h(C), newRiva());
	await act(async () => {
		void box.m?.mutate({ id: '1', name: 'a' });
		void box.m?.mutate({ id: '1', name: 'b' });
	});
	await act(async () => gates[1]?.resolve('second'));
	await act(async () => gates[0]?.resolve('first'));
	expect(m.text()).toBe('success:second');
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
	const m = await mount(h(C), newRiva());
	const rendersBefore = box.renders;
	let result!: Promise<string>;
	await act(async () => {
		result = box.m?.mutate({ id: '1', name: 'a' }) as Promise<string>;
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

test('mutate and reset keep their identity across renders', async () => {
	const [box, C] = setup(async () => 'x');
	const m = await mount(h(C), newRiva());
	const { mutate, reset } = box.m as Rename;
	await act(async () => void box.m?.mutate({ id: '1', name: 'a' }));
	expect(box.m?.mutate).toBe(mutate);
	expect(box.m?.reset).toBe(reset);
	await m.unmount();
});

test('a changed definition resets the state to idle and drops the run still in flight', async () => {
	const gate = deferred<string>();
	const first = mutation<string, string>({
		id: 'um/first',
		mutate: () => gate.promise,
	});
	const second = mutation<string, string>({
		id: 'um/second',
		mutate: async () => 'second',
	});
	const box: { m?: MutationResult<string, string> } = {};
	function C({ def }: { def: typeof first }) {
		box.m = useMutation(def);
		return h('p', null, `${box.m.status}:${box.m.data ?? '-'}`);
	}
	const m = await mount(h(C, { def: first }), newRiva());
	let pending!: Promise<string>;
	await act(async () => {
		pending = box.m?.mutate('x') as Promise<string>;
	});
	expect(m.text()).toBe('loading:-');
	await m.rerender(h(C, { def: second }));
	expect(m.text()).toBe('idle:-');
	gate.resolve('late');
	expect(await pending).toBe('late'); // the run itself still resolves
	await act(async () => {});
	expect(m.text()).toBe('idle:-'); // but no longer reports
	await act(async () => void box.m?.mutate('y'));
	expect(m.text()).toBe('success:second');
	await m.unmount();
});
