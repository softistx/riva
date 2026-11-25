import { expect, test } from 'bun:test';
import { signal, computed } from '@softistx/riva';
import { act } from 'react';
import { h, mount, newClient } from '../test/render';
import { useSignal, useValue } from './use-signal';

test('useSignal reads, sets with a value and with an updater, and re-renders', async () => {
	const count = signal(1);
	const client = newClient();
	let set!: ReturnType<typeof useSignal<number>>[1];
	let renders = 0;
	function Counter() {
		const [n, s] = useSignal(count);
		set = s;
		renders++;
		return h('p', null, `n=${n}`);
	}
	const m = await mount(h(Counter), client);
	expect(m.text()).toBe('n=1');
	await act(async () => set(5));
	expect(m.text()).toBe('n=5');
	await act(async () => set((p) => p + 1));
	expect(m.text()).toBe('n=6');
	expect(client.get(count)).toBe(6);
	const before = renders;
	await act(async () => set(6));
	expect(renders).toBe(before);
	await m.unmount();
});

test('the setter keeps its identity', async () => {
	const a = signal(0);
	const setters: unknown[] = [];
	function C() {
		const [, s] = useSignal(a);
		setters.push(s);
		return null;
	}
	const client = newClient();
	const m = await mount(h(C), client);
	await act(async () => client.set(a, 1));
	expect(new Set(setters).size).toBe(1);
	await m.unmount();
});

test('useValue follows a computed and returns a stable object', async () => {
	const a = signal(1);
	const boxed = computed((get) => ({ twice: get(a) * 2 }));
	const client = newClient();
	const seen: Array<{ twice: number }> = [];
	function V() {
		const v = useValue(boxed);
		seen.push(v);
		return h('p', null, String(v.twice));
	}
	const m = await mount(h(V), client);
	expect(m.text()).toBe('2');
	await act(async () => client.set(a, 4));
	expect(m.text()).toBe('8');
	await m.unmount();
});

test('two clients keep separate values', async () => {
	const a = signal(0);
	const c1 = newClient();
	const c2 = newClient();
	c1.set(a, 1);
	c2.set(a, 2);
	function V() {
		return h('p', null, String(useValue(a)));
	}
	const m1 = await mount(h(V), c1);
	const m2 = await mount(h(V), c2);
	expect([m1.text(), m2.text()]).toEqual(['1', '2']);
	await m1.unmount();
	await m2.unmount();
});
