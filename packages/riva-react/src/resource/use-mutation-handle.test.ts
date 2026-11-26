import { expect, expectTypeOf, test } from 'bun:test';
import { mutationHandle } from '@softistx/riva/resource';
import { deferred, flush, h, mount, newRiva } from '../../test/render';
import { type MutationResult, useMutationHandle } from './use-mutation-handle';

test('idle, loading, success, then reset', async () => {
	const gate = deferred<number>();
	let hook!: MutationResult<{ id: number }, number, never>;
	function C() {
		hook = useMutationHandle('m', (riva) =>
			mutationHandle<{ id: number }, number>(riva, () => gate.promise),
		);
		return h('p', null, `${hook.status}:${hook.data ?? '-'}`);
	}
	const m = await mount(h(C), newRiva());
	expect(m.text()).toBe('idle:-');
	let result!: Promise<number>;
	await flush(() => {
		result = hook.run({ id: 1 });
	});
	expect(m.text()).toBe('loading:-');
	await flush(() => gate.resolve(7));
	expect(await result).toBe(7);
	expect(m.text()).toBe('success:7');
	await flush(() => hook.reset());
	expect(m.text()).toBe('idle:-');
	await m.unmount();
});

test('a failure rejects the call and lands in the state', async () => {
	let hook!: MutationResult<void, number, never>;
	function C() {
		hook = useMutationHandle('m', (riva) =>
			mutationHandle<void, number>(riva, () => Promise.reject(new Error('no'))),
		);
		return h('p', null, hook.status);
	}
	const m = await mount(h(C), newRiva());
	await flush(() => {
		hook.run().catch(() => {});
	});
	expect(m.text()).toBe('error');
	expect((hook.error as Error).message).toBe('no');
	await m.unmount();
});

test('types: the state is a discriminated union beside run', () => {
	const h1 = {} as MutationResult<{ id: number }, string>;
	expectTypeOf(h1.reset).toEqualTypeOf<() => void>();
	if (h1.status === 'success') expectTypeOf(h1.data).toEqualTypeOf<string>();
	expectTypeOf<Parameters<typeof h1.run>[0]>().toEqualTypeOf<{ id: number }>();
});

test('run and reset keep their identity from idle to loading to success', async () => {
	const gate = deferred<number>();
	let hook!: MutationResult<{ id: number }, number, never>;
	function C() {
		hook = useMutationHandle('m', (riva) =>
			mutationHandle<{ id: number }, number>(riva, () => gate.promise),
		);
		return h('p', null, hook.status);
	}
	const m = await mount(h(C), newRiva());
	const { run, reset } = hook;
	await flush(() => void hook.run({ id: 1 }));
	expect(m.text()).toBe('loading');
	expect(hook.run).toBe(run);
	await flush(() => gate.resolve(1));
	expect(m.text()).toBe('success');
	expect(hook.run).toBe(run);
	expect(hook.reset).toBe(reset);
	await m.unmount();
});
