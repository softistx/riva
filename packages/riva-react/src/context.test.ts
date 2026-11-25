import { expect, spyOn, test } from 'bun:test';
import { RivaScopeError } from '@softistx/riva';
import { h, mount, newRiva } from '../test/render';
import { RivaProvider, useClient, useRiva } from './context';

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

test('the deprecated useClient is useRiva, and the provider still takes `client`', async () => {
	expect(useClient).toBe(useRiva);
	const legacy = newRiva();
	const seen: unknown[] = [];
	const m = await mount(
		h(
			RivaProvider,
			{ client: legacy },
			h(Probe, { onRiva: (c) => seen.push(c) }),
		),
		newRiva(),
	);
	expect(seen[0]).toBe(legacy);
	await m.unmount();
});

test('RivaProvider takes `riva` or `client`, never both and never neither', () => {
	const a = newRiva();
	// @ts-expect-error both `riva` and `client`
	h(RivaProvider, { riva: a, client: a });
	// @ts-expect-error neither `riva` nor `client`
	h(RivaProvider, {});
});
