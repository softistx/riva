import { expect, test } from 'bun:test';
import { query } from '@softistx/riva';
import { act } from 'react';
import { deferred, h, mount, newRiva } from '../test/render';
import { useQueryState, useStableVars } from './query-state';

test('useStableVars keeps the first object of a key across renders', async () => {
	const seen: object[] = [];
	function C({ n }: { n: number }) {
		seen.push(useStableVars('q', { n, extra: [1] }).vars);
		return null;
	}
	const m = await mount(h(C, { n: 1 }));
	expect(seen).toHaveLength(1);
	await m.unmount();
	const m2 = await mount(h(C, { n: 1 }));
	expect(seen[1]).not.toBe(seen[0]);
	await m2.unmount();
});

test('useStableVars changes its vars with the key only', async () => {
	const seen: Array<{ key: string; vars: { n: number } }> = [];
	function C({ n }: { n: number }) {
		seen.push(useStableVars('q', { n }));
		return null;
	}
	const container = document.createElement('div');
	const { createRoot } = await import('react-dom/client');
	const root = createRoot(container);
	await act(async () => root.render(h(C, { n: 1 })));
	await act(async () => root.render(h(C, { n: 1 })));
	await act(async () => root.render(h(C, { n: 2 })));
	expect(seen[1]?.vars).toBe(seen[0]?.vars);
	expect(seen[2]?.vars).not.toBe(seen[0]?.vars);
	expect(seen[2]?.key).toBe('q:{"n":2}');
	await act(async () => root.unmount());
});

test('a disabled binding reads idle and does not fetch', async () => {
	const gate = deferred<number>();
	let calls = 0;
	const q = query<void, number>({
		id: 'qs/disabled',
		retry: 0,
		fetch: () => {
			calls++;
			return gate.promise;
		},
	});
	function C() {
		return h('p', null, useQueryState(q, undefined, false).state.status);
	}
	const m = await mount(h(C), newRiva());
	expect(m.text()).toBe('idle');
	expect(calls).toBe(0);
	await m.unmount();
});
