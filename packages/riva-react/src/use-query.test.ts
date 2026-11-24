import { expect, spyOn, test } from 'bun:test';
import { query, RivaScopeError } from '@softistx/riva';
import { Component, type ReactNode, Suspense } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { deferred, flush, h, mount, newClient } from '../test/render';
import { RivaProvider } from './context';
import { useQuery } from './use-query';

const users = (
	id: string,
	fetch: (vars: { school: string }) => Promise<string>,
) =>
	query<{ school: string }, string>({ id, retry: 0, staleTime: '1m', fetch });

function Show({
	def,
	school,
	opts,
}: {
	def: ReturnType<typeof users>;
	school: string;
	opts?: { enabled?: boolean };
}) {
	const q = useQuery(def, { school }, opts);
	return h('p', null, `${q.status}:${q.data ?? '-'}:${q.isFetching}`);
}

test('goes pending then success, and refetch marks it stale and fetches', async () => {
	let n = 0;
	const gates: Array<ReturnType<typeof deferred<string>>> = [];
	const def = users('uq/basic', () => {
		const g = deferred<string>();
		gates.push(g);
		n++;
		return g.promise;
	});
	let refetch!: () => Promise<void>;
	function C() {
		const q = useQuery(def, { school: 's' });
		refetch = q.refetch;
		return h('p', null, `${q.status}:${q.data ?? '-'}`);
	}
	const m = await mount(h(C), newClient());
	expect(m.text()).toBe('pending:-');
	await flush(() => gates[0]?.resolve('a'));
	expect(m.text()).toBe('success:a');
	await flush(() => void refetch());
	expect(n).toBe(2);
	await flush(() => gates[1]?.resolve('b'));
	expect(m.text()).toBe('success:b');
	await m.unmount();
});

test('an error with no data lands in the state', async () => {
	const def = users('uq/error', () => Promise.reject(new Error('nope')));
	let error: unknown;
	function C() {
		const q = useQuery(def, { school: 's' });
		error = q.error;
		return h('p', null, q.status);
	}
	const m = await mount(h(C), newClient());
	await flush();
	expect(m.text()).toBe('error');
	expect((error as Error).message).toBe('nope');
	await m.unmount();
});

test('new variables fetch another entry', async () => {
	const seen: string[] = [];
	const def = users('uq/vars', async ({ school }) => {
		seen.push(school);
		return `data-${school}`;
	});
	const client = newClient();
	const container = document.createElement('div');
	const { createRoot } = await import('react-dom/client');
	const { act } = await import('react');
	const root = createRoot(container);
	const ui = (s: string) =>
		h(RivaProvider, { client }, h(Show, { def, school: s }));
	await act(async () => root.render(ui('a')));
	await flush();
	expect(container.textContent).toBe('success:data-a:false');
	await act(async () => root.render(ui('b')));
	await flush();
	expect(container.textContent).toBe('success:data-b:false');
	expect(seen).toEqual(['a', 'b']);
	await act(async () => root.unmount());
});

test('inline variables do not refetch in a loop', async () => {
	let calls = 0;
	const def = users('uq/stable', async () => {
		calls++;
		return 'x';
	});
	let renders = 0;
	function C() {
		renders++;
		const q = useQuery(def, { school: 's' });
		return h('p', null, q.status);
	}
	const m = await mount(h(C), newClient());
	await flush();
	await flush();
	expect(calls).toBe(1);
	expect(renders).toBeLessThan(6);
	await m.unmount();
});

test('enabled: false observes nothing and reads idle, then fetches once enabled', async () => {
	let calls = 0;
	const def = users('uq/enabled', async () => {
		calls++;
		return 'x';
	});
	const client = newClient();
	const { createRoot } = await import('react-dom/client');
	const { act } = await import('react');
	const container = document.createElement('div');
	const root = createRoot(container);
	const ui = (enabled: boolean) =>
		h(
			RivaProvider,
			{ client },
			h(Show, { def, school: 's', opts: { enabled } }),
		);
	await act(async () => root.render(ui(false)));
	await flush();
	expect(container.textContent).toBe('idle:-:false');
	expect(calls).toBe(0);
	await act(async () => root.render(ui(true)));
	await flush();
	expect(container.textContent).toBe('success:x:false');
	expect(calls).toBe(1);
	await act(async () => root.unmount());
});

test('unmounting stops observing', async () => {
	let calls = 0;
	const def = query<void, number>({
		id: 'uq/poll',
		retry: 0,
		fetch: async () => ++calls,
	});
	function C() {
		return h('p', null, String(useQuery(def).data));
	}
	const client = newClient();
	const m = await mount(h(C), client);
	await flush();
	expect(m.text()).toBe('1');
	await m.unmount();
	expect(client.queries.state(def, undefined).data).toBe(1);
});

class Boundary extends Component<
	{ children: ReactNode },
	{ error: Error | undefined }
> {
	override state = { error: undefined as Error | undefined };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	override render() {
		return this.state.error
			? h('p', null, `caught:${this.state.error.message}`)
			: this.props.children;
	}
}

test('suspense shows the fallback then the content, with one fetch', async () => {
	const gate = deferred<string>();
	let calls = 0;
	const def = users('uq/suspense', () => {
		calls++;
		return gate.promise;
	});
	function C() {
		const q = useQuery(def, { school: 's' }, { suspense: true });
		return h('p', null, `got:${q.data.toUpperCase()}`);
	}
	const m = await mount(
		h(Suspense, { fallback: h('p', null, 'loading') }, h(C)),
		newClient(),
	);
	expect(m.text()).toBe('loading');
	await flush(() => gate.resolve('abc'));
	expect(m.text()).toBe('got:ABC');
	expect(calls).toBe(1);
	await m.unmount();
});

test('suspense throws an error with no data to the error boundary', async () => {
	const log = spyOn(console, 'error').mockImplementation(() => {});
	const def = users('uq/suspense-err', () => Promise.reject(new Error('bad')));
	function C() {
		useQuery(def, { school: 's' }, { suspense: true });
		return h('p', null, 'unreachable');
	}
	const m = await mount(
		h(Boundary, null, h(Suspense, { fallback: h('p', null, 'loading') }, h(C))),
		newClient(),
	);
	await flush();
	expect(m.text()).toBe('caught:bad');
	await m.unmount();
	log.mockRestore();
});

test('suspense with data already cached renders at once', async () => {
	const def = users('uq/suspense-hot', async () => 'cold');
	const client = newClient();
	def.setData(client, { school: 's' }, 'hot');
	function C() {
		return h(
			'p',
			null,
			useQuery(def, { school: 's' }, { suspense: true }).data,
		);
	}
	const m = await mount(
		h(Suspense, { fallback: h('p', null, 'loading') }, h(C)),
		client,
	);
	expect(m.text()).toBe('hot');
	await m.unmount();
});

async function html(client: ReturnType<typeof newClient>, ui: ReactNode) {
	const stream = await renderToReadableStream(h(RivaProvider, { client }, ui));
	await stream.allReady;
	const text = await new Response(stream).text();
	// The server renderer leaves its mark on the context; the DOM tests that
	// follow in this process would warn about two renderers.
	const context = RivaProvider({ client }).type as unknown as Record<
		string,
		unknown
	>;
	context['_currentRenderer'] = null;
	context['_currentRenderer2'] = null;
	return text;
}

test('streaming SSR keeps two requests apart', async () => {
	const def = users('uq/ssr', async ({ school }) => {
		await new Promise((r) => setTimeout(r, school === 'a' ? 15 : 5));
		return `data-${school}`;
	});
	function Page({ school }: { school: string }) {
		const q = useQuery(def, { school }, { suspense: true });
		return h('p', null, q.data);
	}
	const page = (school: string) =>
		h(Suspense, { fallback: h('p', null, 'loading') }, h(Page, { school }));
	const ca = newClient();
	const cb = newClient();
	const [a, b] = await Promise.all([html(ca, page('a')), html(cb, page('b'))]);
	expect(a).toContain('data-a');
	expect(a).not.toContain('data-b');
	expect(b).toContain('data-b');
	expect(b).not.toContain('data-a');
	expect(ca.queries.state(def, { school: 'b' }).status).toBe('idle');
});

test('a server render without suspense starts no fetch', async () => {
	let calls = 0;
	const def = users('uq/ssr-idle', async () => {
		calls++;
		return 'x';
	});
	function Page() {
		return h('p', null, useQuery(def, { school: 's' }).status);
	}
	expect(await html(newClient(), h(Page))).toContain('idle');
	expect(calls).toBe(0);
});

test('no provider throws the scope error', async () => {
	const log = spyOn(console, 'error').mockImplementation(() => {});
	const def = users('uq/noprov', async () => 'x');
	let caught: unknown;
	try {
		await mount(h(Show, { def, school: 's' }));
	} catch (e) {
		caught = e;
	}
	log.mockRestore();
	expect(caught).toBeInstanceOf(RivaScopeError);
});
