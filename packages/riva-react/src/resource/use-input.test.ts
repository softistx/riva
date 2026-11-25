import { expect, test } from 'bun:test';
import { signal } from '@softistx/riva';
import { h, mount, newRiva } from '../../test/render';
import { type StableInput, useStableInput } from './use-input';

type Args = Parameters<typeof useStableInput>;

async function inputs(...calls: Array<[Args[1], Args[2]]>) {
	const out: StableInput[] = [];
	const riva = newRiva();
	for (const [input, enabled] of calls) {
		function C() {
			out.push(useStableInput('op', input, enabled));
			return null;
		}
		const m = await mount(h(C), riva);
		await m.unmount();
	}
	return out;
}

test('a plain value is keyed by its stable serialization', async () => {
	const [a, b, c] = await inputs(
		[{ x: 1, y: 2 }, undefined],
		[{ y: 2, x: 1 }, undefined],
		[{ x: 2, y: 2 }, undefined],
	);
	expect(a?.key).toBe(b?.key as string);
	expect(a?.key).not.toBe(c?.key as string);
	expect(a?.input).toEqual({ x: 1, y: 2 });
	expect(a?.enabled).toBe(true);
});

test('enabled is part of the key', async () => {
	const [on, off] = await inputs([1, undefined], [1, false]);
	expect(on?.key).not.toBe(off?.key as string);
	expect(off?.enabled).toBe(false);
});

test('a function is read once at render, only while enabled, and follows its props', async () => {
	let calls = 0;
	const riva = newRiva();
	const seen: StableInput[] = [];
	function C({ n, on }: { n: number; on: boolean }) {
		seen.push(
			useStableInput(
				'op',
				() => {
					calls++;
					return { n };
				},
				on,
			),
		);
		return null;
	}
	const m = await mount(h(C, { n: 1, on: false }), riva);
	expect(calls).toBe(0);
	await m.rerender(h(C, { n: 1, on: true }));
	expect(calls).toBe(1);
	const k1 = seen.at(-1)?.key;
	await m.rerender(h(C, { n: 2, on: true }));
	expect(seen.at(-1)?.key).not.toBe(k1 as string);
	await m.unmount();
});

test('the input handed on is the one of the render that changed the key', async () => {
	const riva = newRiva();
	const seen: StableInput[] = [];
	function C({ n, tick }: { n: number; tick: number }) {
		seen.push(useStableInput('op', () => ({ n }), undefined));
		return h('i', null, tick);
	}
	const m = await mount(h(C, { n: 1, tick: 0 }), riva);
	await m.rerender(h(C, { n: 1, tick: 1 }));
	const [a, b] = seen.slice(-2);
	expect(a?.key).toBe(b?.key as string);
	expect(a?.input).toBe(b?.input);
	await m.unmount();
});

test('a signal is passed as given and read untracked for the key', async () => {
	const s = signal({ id: 5 });
	const [a] = await inputs([s, undefined]);
	expect(a?.input).toBe(s);
	expect(a?.key).toContain('5');
});
