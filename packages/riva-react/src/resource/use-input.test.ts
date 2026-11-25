import { expect, test } from 'bun:test';
import { signal } from '@softistx/riva';
import { h, mount, newRiva } from '../../test/render';
import { type StableInput, useStableInput } from './use-input';

type Args = Parameters<typeof useStableInput>;

async function inputs(...calls: Array<[Args[1], Args[2], Args[3]?]>) {
	const out: StableInput[] = [];
	const riva = newRiva();
	for (const [input, enabled, suspense] of calls) {
		function C() {
			out.push(useStableInput('op', input, enabled, suspense ?? false));
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

test('a function is not called by the hook and reads the latest closure', async () => {
	let calls = 0;
	const riva = newRiva();
	let seen!: StableInput;
	function C({ n }: { n: number }) {
		seen = useStableInput(
			'op',
			() => {
				calls++;
				return { n };
			},
			undefined,
			false,
		);
		return null;
	}
	const m = await mount(h(C, { n: 1 }), riva);
	expect(calls).toBe(0);
	expect((seen.input as () => unknown)()).toEqual({ n: 1 });
	await m.unmount();
});

test('with suspense the value is read once, only while enabled', async () => {
	let calls = 0;
	const fn = () => {
		calls++;
		return { id: 1 };
	};
	const [off, on] = await inputs([fn, false, true], [fn, true, true]);
	expect(calls).toBe(1);
	expect(off?.key).toContain('off');
	expect(on?.key).not.toContain('off');
});

test('a signal is passed as given and read for the suspense key', async () => {
	const s = signal({ id: 5 });
	const [a] = await inputs([s, undefined, true]);
	expect(a?.input).toBe(s);
	expect(a?.key).toContain('5');
});
