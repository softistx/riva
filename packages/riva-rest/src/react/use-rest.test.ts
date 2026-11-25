import '../../test/happydom';
import { expect, expectTypeOf, test } from 'bun:test';
import { createRiva, signal } from '@softistx/riva';
import type { ResourceState } from '@softistx/riva/resource';
import { dehydrate, hydrate } from '@softistx/riva/ssr';
import { RivaProvider } from '@softistx/riva-react';
import { Component, type ReactNode, Suspense } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import {
	apiOver,
	type Handler,
	httpWith,
	type Invoice,
	json,
} from '../../test/fixtures';
import { flush, h, mount } from '../../test/render';
import { rest } from '../simple';
import type { UseRestOptions } from './types';
import { useRest } from './use-rest';

const inv = (id: string): Invoice => ({ id, number: `N${id}`, total: 10 });

function server(
	gates?: Map<string, () => void>,
	defaults?: { staleTime: '1m' },
) {
	const seen: string[] = [];
	const handle: Handler = async (req) => {
		const u = new URL(req.url);
		seen.push(`${req.method} ${u.pathname}${u.search}`);
		if (u.pathname === '/health') return json({ ok: true });
		const id = u.pathname.split('/')[2] ?? '';
		if (gates) await new Promise<void>((r) => gates.set(id, r));
		return id === 'missing' ? json({ title: 'gone' }, 404) : json(inv(id));
	};
	const api = apiOver(httpWith(handle));
	return {
		seen,
		riva: createRiva({ ...(defaults ? { defaults } : {}), rest: rest(api) }),
	};
}

const show = (s: ResourceState<Invoice | { ok: boolean }>) =>
	`${s.status}:${(s.data as Invoice | undefined)?.id ?? '-'}:${s.placeholder}`;

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
	override state = { error: undefined as unknown };
	static getDerivedStateFromError(error: unknown) {
		return { error };
	}
	override render() {
		return this.state.error ? h('p', null, 'caught') : this.props.children;
	}
}

test('goes loading then success, and an error lands in the state', async () => {
	const gates = new Map<string, () => void>();
	const { riva, seen } = server(gates);
	function C({ id }: { id: string }) {
		return h(
			'p',
			null,
			show(useRest('get', '/invoices/{id}', { param: { id } })),
		);
	}
	const m = await mount(h(C, { id: '1' }), riva);
	expect(m.text()).toStartWith('loading');
	await flush(() => gates.get('1')?.());
	expect(m.text()).toBe('success:1:false');
	expect(seen).toEqual(['GET /invoices/1']);
	await m.rerender(h(C, { id: 'missing' }));
	await flush(() => gates.get('missing')?.());
	expect(m.text()).toStartWith('error');
	await m.unmount();
});

test('a new input refetches and keeps the previous data as a placeholder', async () => {
	const gates = new Map<string, () => void>();
	const { riva } = server(gates);
	function C({
		id,
		opts,
	}: {
		id: string;
		opts?: UseRestOptions & { suspense?: false };
	}) {
		return h(
			'p',
			null,
			show(useRest('get', '/invoices/{id}', { param: { id } }, opts)),
		);
	}
	const m = await mount(h(C, { id: '1' }), riva);
	await flush(() => gates.get('1')?.());
	expect(m.text()).toBe('success:1:false');
	await m.rerender(h(C, { id: '2' }));
	expect(m.text()).toBe('success:1:true');
	await flush(() => gates.get('2')?.());
	expect(m.text()).toBe('success:2:false');
	await m.unmount();
});

test('enabled false is idle with no request and no input function call', async () => {
	const { riva, seen } = server();
	let evaluated = 0;
	function C({ on }: { on: boolean }) {
		const s = useRest(
			'get',
			'/invoices/{id}',
			() => {
				evaluated++;
				return { param: { id: '1' } };
			},
			{ enabled: on },
		);
		return h('p', null, s.status);
	}
	const m = await mount(h(C, { on: false }), riva);
	await flush();
	expect([m.text(), evaluated, seen.length]).toEqual(['idle', 0, 0]);
	await m.rerender(h(C, { on: true }));
	await flush();
	expect(m.text()).toBe('success');
	expect(seen).toEqual(['GET /invoices/1']);
	await m.unmount();
});

test('a signal as input re-derives the key', async () => {
	const { riva, seen } = server();
	const id = signal('1');
	function C() {
		return h(
			'p',
			null,
			show(
				useRest('get', '/invoices/{id}', () => ({
					param: { id: riva.get(id) },
				})),
			),
		);
	}
	const m = await mount(h(C), riva);
	await flush();
	await flush(() => riva.set(id, '2'));
	expect(m.text()).toBe('success:2:false');
	expect(seen).toEqual(['GET /invoices/1', 'GET /invoices/2']);
	await m.unmount();
});

test('suspense waits, then shows success; an error goes to the boundary', async () => {
	const gates = new Map<string, () => void>();
	const { riva, seen } = server(gates);
	function C({ id }: { id: string }) {
		const s = useRest(
			'get',
			'/invoices/{id}',
			{ param: { id } },
			{ suspense: true },
		);
		expectTypeOf(s.data).toEqualTypeOf<Invoice>();
		return h('p', null, s.data.id);
	}
	const m = await mount(
		h(Suspense, { fallback: 'wait' }, h(C, { id: '1' })),
		riva,
	);
	expect(m.text()).toBe('wait');
	await flush(() => gates.get('1')?.());
	expect(m.text()).toBe('1');
	expect(seen).toHaveLength(1);
	await m.unmount();
	const spy = console.error;
	console.error = () => {};
	try {
		const bad = await mount(
			h(
				Boundary,
				null,
				h(Suspense, { fallback: 'wait' }, h(C, { id: 'missing' })),
			),
			riva,
		);
		await flush(() => gates.get('missing')?.());
		expect(bad.text()).toBe('caught');
		await bad.unmount();
	} finally {
		console.error = spy;
	}
});

test('SSR: renders what a loader fetched, and fetches during the render with suspense', async () => {
	const { riva, seen } = server();
	await riva.rest.get('/invoices/{id}', { param: { id: '1' } });
	function C({ id }: { id: string }) {
		return h(
			'p',
			null,
			show(
				useRest('get', '/invoices/{id}', { param: { id } }, { suspense: true }),
			),
		);
	}
	const html = async (r: typeof riva, id: string) => {
		const stream = await renderToReadableStream(
			h(
				RivaProvider,
				{ riva: r },
				h(Suspense, { fallback: 'wait' }, h(C, { id })),
			),
		);
		await stream.allReady;
		return new Response(stream).text();
	};
	expect(await html(riva, '1')).toContain('success:1');
	expect(seen).toEqual(['GET /invoices/1']);
	const other = server();
	expect(await html(other.riva, '2')).toContain('success:2');
	// Hydrating on the seeded riva shows the data at once and does not refetch it.
	const m = await mount(h(C, { id: '1' }), riva);
	expect(m.text()).toBe('success:1:false');
	await flush();
	expect(seen).toEqual(['GET /invoices/1']);
	await m.unmount();
	const context = RivaProvider({ riva }).type as unknown as Record<
		string,
		unknown
	>;
	context['_currentRenderer'] = null;
	context['_currentRenderer2'] = null;
});

test('without a rest extension it throws a RIVA_DEFINITION error saying how to install it', async () => {
	function C() {
		useRest('get', '/health');
		return null;
	}
	const spy = console.error;
	console.error = () => {};
	try {
		await expect(mount(h(C), createRiva())).rejects.toThrow(
			'createRiva({ rest: rest(api) })',
		);
	} finally {
		console.error = spy;
	}
});

test('types: data comes from the operations table', () => {
	const s = {} as ReturnType<typeof useRest<'/health'>>;
	expectTypeOf(s).toEqualTypeOf<ResourceState<{ ok: boolean }>>();
});

test('SSR lifecycle: a server fetch, dehydrate and hydrate leave the client mount with no second call', async () => {
	const defaults = { staleTime: '1m' } as const;
	const origin = server(undefined, defaults);
	await origin.riva.rest.get('/invoices/{id}', { param: { id: '1' } });
	const snapshot = dehydrate(origin.riva);
	const client = server(undefined, defaults);
	hydrate(client.riva, snapshot);
	function C() {
		return h(
			'p',
			null,
			show(useRest('get', '/invoices/{id}', { param: { id: '1' } })),
		);
	}
	const m = await mount(h(C), client.riva);
	await flush();
	expect(m.text()).toBe('success:1:false');
	expect(origin.seen).toEqual(['GET /invoices/1']);
	expect(client.seen).toEqual([]);
	await m.unmount();
});
