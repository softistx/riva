import '../../test/happydom';
import { expect, expectTypeOf, test } from 'bun:test';
import { createRiva } from '@softistx/riva';
import type { MutationHook } from '@softistx/riva-react/resource';
import {
	apiOver,
	type Handler,
	httpWith,
	type Invoice,
	json,
} from '../../test/fixtures';
import { flush, h, mount } from '../../test/render';
import type { RestMutateCall } from '../calls';
import { withRest } from '../simple';
import { useRest } from './use-rest';
import { useRestMutation } from './use-rest-mutation';

function setup() {
	let n = 0;
	const seen: string[] = [];
	const handle: Handler = async (req) => {
		const u = new URL(req.url);
		seen.push(`${req.method} ${u.pathname}`);
		if (req.method === 'POST')
			return json(
				{ id: '9', number: 'N9', total: 1, ...(await req.json()) },
				201,
			);
		if (req.method === 'DELETE') return new Response(null, { status: 204 });
		return json({ items: [{ id: String(++n), number: 'n', total: 1 }] });
	};
	return {
		seen,
		riva: createRiva({ rest: withRest(apiOver(httpWith(handle))) }),
	};
}

test('idle, loading, success, reset; invalidates refetches the observed GET', async () => {
	const { riva, seen } = setup();
	let create!: (...a: unknown[]) => Promise<unknown>;
	let hook!: { status: string; data: unknown; reset(): void };
	function C() {
		const r = useRestMutation('post', '/invoices');
		hook = r as never;
		create = r as never;
		const list = useRest('get', '/invoices', {});
		return h(
			'p',
			null,
			`${r.status}:${(list.data as { items: Invoice[] } | undefined)?.items[0]?.id ?? '-'}`,
		);
	}
	const m = await mount(h(C), riva);
	await flush();
	expect(m.text()).toBe('idle:1');
	let out: unknown;
	await flush(async () => {
		out = await create(
			{ json: { number: 'X', total: 5 } },
			{ invalidates: ['/invoices'] },
		);
	});
	expect(out).toMatchObject({ id: '9', number: 'X' });
	expect(m.text()).toBe('success:2');
	expect(seen).toEqual(['GET /invoices', 'POST /invoices', 'GET /invoices']);
	await flush(() => hook.reset());
	expect(m.text()).toBe('idle:2');
	await m.unmount();
});

test('a failure rejects the call and lands in the state', async () => {
	const riva = createRiva({
		rest: withRest(apiOver(httpWith(async () => json({ title: 'no' }, 500)))),
	});
	let create!: (...a: unknown[]) => Promise<unknown>;
	let status = '';
	function C() {
		const r = useRestMutation('post', '/invoices');
		create = r as never;
		status = r.status;
		return null;
	}
	const m = await mount(h(C), riva);
	await flush(async () => {
		await create({ json: { number: 'X', total: 5 } }).catch(() => {});
	});
	expect(status).toBe('error');
	await m.unmount();
});

test('types: input and data come from the operations table', () => {
	const hook = {} as ReturnType<typeof useRestMutation<'post', '/invoices'>>;
	expectTypeOf(hook).toEqualTypeOf<
		MutationHook<
			{ json: { number: string; total: number } },
			Invoice,
			RestMutateCall
		>
	>();
});
