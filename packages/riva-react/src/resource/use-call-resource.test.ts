import { expect, test } from 'bun:test';
import type { Riva } from '@softistx/riva';
import { query } from '@softistx/riva';
import { resource } from '@softistx/riva/resource';
import { flush, h, mount, newRiva } from '../../test/render';
import {
	type CallResourceOptions,
	type ResourceCall,
	useCallResource,
} from './use-call-resource';

const q = query<{ k: number }, string>({
	id: 'q',
	retry: 0,
	fetch: async ({ k }) => `v${k}`,
});

async function run(
	options: CallResourceOptions,
	vars: unknown = { k: 1 },
	riva: Riva = newRiva(),
) {
	const calls: Array<{ input: unknown; call: ResourceCall }> = [];
	const seen: string[] = [];
	function C() {
		const s = useCallResource('q', vars, options, (r, input, call) => {
			calls.push({ input, call });
			return resource(r, () => [q, input as { k: number }], call);
		});
		seen.push(s.status);
		return null;
	}
	const m = await mount(h(C), riva);
	await flush();
	await m.unmount();
	return { calls, seen };
}

test('builds the call once with the input and `enabled` true by default', async () => {
	const { calls, seen } = await run({});
	expect(calls).toHaveLength(1);
	expect(calls[0]?.input).toEqual({ k: 1 });
	expect(calls[0]?.call).toEqual({ enabled: true });
	expect(seen.at(-1)).toBe('success');
});

test('passes keepPrevious and staleTime as given', async () => {
	const { calls } = await run({ keepPrevious: false, staleTime: 5000 });
	expect(calls[0]?.call).toEqual({
		enabled: true,
		keepPrevious: false,
		staleTime: 5000,
	});
});

test('suspense raises staleTime to at least 1000 ms and the data is there', async () => {
	const riva = newRiva();
	await q.ensure(riva, { k: 1 });
	const { calls } = await run(
		{ suspense: true, staleTime: 10 },
		{ k: 1 },
		riva,
	);
	expect(calls[0]?.call.staleTime).toBe(1000);
});

test('enabled false is idle', async () => {
	const { seen } = await run({ enabled: false });
	expect(seen.at(-1)).toBe('idle');
});
