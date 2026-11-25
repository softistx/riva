import { expect, spyOn, test } from 'bun:test';
import { RivaScopeError } from '@softistx/riva';
import { h, mount, newRiva } from '../test/render';
import { RivaProvider, useRiva } from './context';

function Probe({ onRiva }: { onRiva: (c: unknown) => void }) {
	onRiva(useRiva());
	return null;
}

test('useRiva returns the riva of the nearest provider', async () => {
	const outer = newRiva();
	const inner = newRiva();
	const seen: unknown[] = [];
	const ui = h(
		RivaProvider,
		{ riva: inner },
		h(Probe, { onRiva: (c) => seen.push(c) }),
	);
	const m = await mount(ui, outer);
	expect(seen[0]).toBe(inner);
	await m.unmount();
});

test('without a provider it throws a RivaScopeError naming the fix', async () => {
	const error = spyOn(console, 'error').mockImplementation(() => {});
	let caught: unknown;
	try {
		await mount(h(Probe, { onRiva: () => {} }));
	} catch (e) {
		caught = e;
	}
	error.mockRestore();
	expect(caught).toBeInstanceOf(RivaScopeError);
	expect((caught as Error).message).toContain('<RivaProvider riva=');
});

test('the removed `client` prop is a type error', () => {
	// @ts-expect-error `client` was removed: use `riva`
	h(RivaProvider, { client: newRiva() });
});
