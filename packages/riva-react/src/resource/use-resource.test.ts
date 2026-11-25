import { expect, expectTypeOf, spyOn, test } from 'bun:test';
import {
	createRiva,
	type Query,
	query,
	type Riva,
	RivaScopeError,
} from '@softistx/riva';
import { type Resource, resource } from '@softistx/riva/resource';
import { Component, type ReactNode, Suspense } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { deferred, flush, h, mount, newRiva } from '../../test/render';
import { RivaProvider } from '../context';
import {
	type IdleState,
	type SuspendedState,
	suspenseStaleTime,
	type UseResourceOptions,
	useResource,
} from './use-resource';

const users = (
	id: string,
	fetch: (vars: { school: string }) => Promise<string>,
) => query<{ school: string }, string>({ id, retry: 0, fetch });

const of =
	(def: Query<{ school: string }, string>, school: string, enabled = true) =>
	(riva: Riva): Resource<string> =>
		resource(riva, () => [def, { school }], { enabled });

function Show({
	def,
	school,
	opts,
	enabled,
}: {
	def: Query<{ school: string }, string>;
	school: string;
	opts?: UseResourceOptions;
	enabled?: boolean;
}) {
	const s = useResource(
		`${def.id}:${school}:${enabled}`,
		of(def, school, enabled),
		opts,
	);
	return h(
		'p',
		null,
		`${s.status}:${s.data ?? '-'}:${s.isFetching}:${s.placeholder}`,
	);
}

test('goes loading then success', async () => {
	const gate = deferred<string>();
	const def = users('ur/basic', () => gate.promise);
	const m = await mount(h(Show, { def, school: 'a' }), newRiva());
	expect(m.text()).toBe('loading:-:true:false');
	await flush(() => gate.resolve('x'));
	expect(m.text()).toBe('success:x:false:false');
	await m.unmount();
});

test('an error with no data lands in the state', async () => {
	const def = users('ur/error', () => Promise.reject(new Error('nope')));
	let error: unknown;
	function C() {
		const s = useResource('k', of(def, 'a'));
		error = s.error;
		return h('p', null, s.status);
	}
	const m = await mount(h(C), newRiva());
	await flush();
	expect(m.text()).toBe('error');
	expect((error as Error).message).toBe('nope');
	await m.unmount();
});

test('disabled reads idle and fetches nothing, then fetches once enabled', async () => {
	let calls = 0;
	const def = users('ur/enabled', async () => {
		calls++;
		return 'x';
	});
	const riva = newRiva();
	const { createRoot } = await import('react-dom/client');
	const { act } = await import('react');
	const container = document.createElement('div');
	const r = createRoot(container);
	const ui = (enabled: boolean) =>
		h(RivaProvider, { riva }, h(Show, { def, school: 's', enabled }));
	await act(async () => r.render(ui(false)));
	await flush();
	expect(container.textContent).toBe('idle:-:false:false');
	expect(calls).toBe(0);
	await act(async () => r.render(ui(true)));
	await flush();
	expect(container.textContent).toBe('success:x:false:false');
	expect(calls).toBe(1);
	await act(async () => r.unmount());
});

test('a key change shows the previous data as a placeholder until the new one lands', async () => {
	const gates: Record<string, ReturnType<typeof deferred<string>>> = {
		a: deferred(),
		b: deferred(),
		c: deferred(),
	};
	const def = users(
		'ur/placeholder',
		({ school }) =>
			(gates[school] as never as { promise: Promise<string> }).promise,
	);
	const riva = newRiva();
	const { createRoot } = await import('react-dom/client');
	const { act } = await import('react');
	const container = document.createElement('div');
	const root = createRoot(container);
	const ui = (s: string, opts?: UseResourceOptions) =>
		h(
			RivaProvider,
			{ riva },
			h(Show, { def, school: s, ...(opts ? { opts } : {}) }),
		);
	await act(async () => root.render(ui('a')));
	await flush(() => gates['a']?.resolve('data-a'));
	expect(container.textContent).toBe('success:data-a:false:false');
	await act(async () => root.render(ui('b')));
	expect(container.textContent).toBe('success:data-a:true:true');
	await flush(() => gates['b']?.resolve('data-b'));
	expect(container.textContent).toBe('success:data-b:false:false');
	await act(async () => root.render(ui('c', { keepPrevious: false })));
	expect(container.textContent).toStartWith('loading:-');
	await act(async () => root.unmount());
});

test("a disabled gap clears the placeholder: a new key never shows the old key's data", async () => {
	const gates: Record<string, ReturnType<typeof deferred<string>>> = {
		a: deferred(),
		b: deferred(),
	};
	const def = users(
		'ur/gap',
		({ school }) =>
			(gates[school] as never as { promise: Promise<string> }).promise,
	);
	const riva = newRiva();
	const { createRoot } = await import('react-dom/client');
	const { act } = await import('react');
	const container = document.createElement('div');
	const root = createRoot(container);
	const ui = (school: string, enabled: boolean) =>
		h(RivaProvider, { riva }, h(Show, { def, school, enabled }));
	await act(async () => root.render(ui('a', true)));
	await flush(() => gates['a']?.resolve('data-a'));
	expect(container.textContent).toBe('success:data-a:false:false');
	await act(async () => root.render(ui('a', false)));
	expect(container.textContent).toBe('idle:-:false:false');
	await act(async () => root.render(ui('b', true)));
	expect(container.textContent).toBe('loading:-:true:false');
	await act(async () => root.unmount());
});

test('the resource is observed while mounted and released at unmount', async () => {
	const def = users('ur/unmount', async () => 'x');
	const log: string[] = [];
	function C() {
		useResource('k', (riva) => {
			const inner = resource(riva, () => [def, { school: 's' }]);
			return {
				get state() {
					return inner.state;
				},
				subscribe(l) {
					log.push('open');
					const off = inner.subscribe(l);
					return () => {
						log.push('close');
						off();
					};
				},
				// biome-ignore lint/suspicious/noThenProperty: a resource is awaitable
				then: inner.then,
			} satisfies Resource<string>;
		});
		return null;
	}
	const m = await mount(h(C), newRiva());
	expect(log).toEqual(['open']);
	await m.unmount();
	expect(log).toEqual(['open', 'close']);
});

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
	override state = { error: undefined as unknown };
	static getDerivedStateFromError(error: unknown) {
		return { error };
	}
	override render() {
		return this.state.error
			? h('p', null, `caught:${(this.state.error as Error).message}`)
			: this.props.children;
	}
}

test('suspense waits for the data, then shows it as success', async () => {
	const gate = deferred<string>();
	const def = users('ur/suspense', () => gate.promise);
	function C() {
		const s = useResource('k', of(def, 'a'), { suspense: true });
		expectTypeOf(s).toEqualTypeOf<SuspendedState<string> | IdleState>();
		return h('p', null, `${s.status}:${s.data}`);
	}
	const m = await mount(
		h(Suspense, { fallback: h('p', null, 'wait') }, h(C)),
		newRiva(),
	);
	expect(m.text()).toBe('wait');
	await flush(() => gate.resolve('x'));
	expect(m.text()).toBe('success:x');
	await m.unmount();
});

test('suspense over a fetch that settles with undefined renders success, no loop', async () => {
	let calls = 0;
	const def = query<{ school: string }, undefined>({
		id: 'ur/empty',
		retry: 0,
		fetch: async () => {
			calls++;
			return undefined;
		},
	});
	function C() {
		const s = useResource(
			'k',
			(riva) =>
				resource(riva, () => [def, { school: 'a' }], {
					staleTime: suspenseStaleTime(riva),
				}),
			{ suspense: true },
		);
		return h('p', null, `${s.status}:${String(s.data)}`);
	}
	const m = await mount(
		h(Suspense, { fallback: h('p', null, 'wait') }, h(C)),
		newRiva(),
	);
	await flush();
	expect(m.text()).toBe('success:undefined');
	expect(calls).toBe(1);
	await m.unmount();
});

test('suspenseStaleTime is the longer of the call or riva default and 1000 ms', () => {
	const riva = newRiva();
	expect(suspenseStaleTime(riva)).toBe(1000);
	expect(suspenseStaleTime(riva, 200)).toBe(1000);
	expect(suspenseStaleTime(riva, '30s')).toBe(30_000);
	const slow = createRiva({ defaults: { staleTime: '5m' } });
	expect(suspenseStaleTime(slow)).toBe(300_000);
});

test('suspense throws an error to the boundary and skips a disabled resource', async () => {
	const def = users('ur/suspense-err', () => Promise.reject(new Error('bad')));
	function C({ enabled }: { enabled: boolean }) {
		const s = useResource('k', of(def, 'a', enabled), { suspense: true });
		return h('p', null, s.status);
	}
	const spy = console.error;
	console.error = () => {};
	try {
		const m = await mount(
			h(
				Boundary,
				null,
				h(Suspense, { fallback: 'wait' }, h(C, { enabled: true })),
			),
			newRiva(),
		);
		await flush();
		expect(m.text()).toBe('caught:bad');
		await m.unmount();
	} finally {
		console.error = spy;
	}
	const off = await mount(h(C, { enabled: false }), newRiva());
	expect(off.text()).toBe('idle');
	await off.unmount();
});

test('without a provider it throws the scope error', async () => {
	const def = users('ur/scope', async () => 'x');
	const log = spyOn(console, 'error').mockImplementation(() => {});
	let caught: unknown;
	try {
		await mount(h(Show, { def, school: 'a' }));
	} catch (e) {
		caught = e;
	}
	log.mockRestore();
	expect(caught).toBeInstanceOf(RivaScopeError);
});

test('a server render seeds from what a loader fetched and starts no client fetch', async () => {
	let calls = 0;
	const def = users('ur/ssr', async ({ school }) => {
		calls++;
		return `data-${school}`;
	});
	const riva = newRiva();
	await riva.untracked(() => def.ensure(riva, { school: 'a' }));
	expect(calls).toBe(1);
	const render = async (suspense: boolean) => {
		const stream = await renderToReadableStream(
			h(
				RivaProvider,
				{ riva },
				h(
					Suspense,
					{ fallback: 'wait' },
					h(Show, { def, school: 'a', opts: { suspense } }),
				),
			),
		);
		await stream.allReady;
		return new Response(stream).text();
	};
	expect(await render(false)).toContain('success:data-a');
	expect(await render(true)).toContain('success:data-a');
	expect(calls).toBe(1);
	// An empty riva with suspense fetches on the server and renders the data.
	const fresh = newRiva();
	const stream = await renderToReadableStream(
		h(
			RivaProvider,
			{ riva: fresh },
			h(
				Suspense,
				{ fallback: 'wait' },
				h(Show, { def, school: 'b', opts: { suspense: true } }),
			),
		),
	);
	await stream.allReady;
	expect(await new Response(stream).text()).toContain('success:data-b');
	// Without suspense a server render of an empty riva starts nothing.
	expect(calls).toBe(2);
	const context = RivaProvider({ riva }).type as unknown as Record<
		string,
		unknown
	>;
	context['_currentRenderer'] = null;
	context['_currentRenderer2'] = null;
});

test('types: the state narrows on status, suspense gives success', () => {
	expectTypeOf<SuspendedState<number>['status']>().toEqualTypeOf<'success'>();
	expectTypeOf<SuspendedState<number>['data']>().toEqualTypeOf<number>();
});
