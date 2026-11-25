import { expect, spyOn, test } from 'bun:test';
import { RivaScopeError } from '@softistx/riva';
import { h, mount, newClient } from '../test/render';
import { RivaProvider, useClient } from './context';

function Probe({ onClient }: { onClient: (c: unknown) => void }) {
	onClient(useClient());
	return null;
}

test('useClient returns the client of the nearest provider', async () => {
	const outer = newClient();
	const inner = newClient();
	const seen: unknown[] = [];
	const ui = h(
		RivaProvider,
		{ client: inner },
		h(Probe, { onClient: (c) => seen.push(c) }),
	);
	const m = await mount(ui, outer);
	expect(seen[0]).toBe(inner);
	await m.unmount();
});

test('without a provider it throws a RivaScopeError naming the fix', async () => {
	const error = spyOn(console, 'error').mockImplementation(() => {});
	let caught: unknown;
	try {
		await mount(h(Probe, { onClient: () => {} }));
	} catch (e) {
		caught = e;
	}
	error.mockRestore();
	expect(caught).toBeInstanceOf(RivaScopeError);
	expect((caught as Error).message).toContain('<RivaProvider client=');
});
