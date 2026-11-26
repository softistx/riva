import { expect, spyOn, test } from 'bun:test';
import {
	type CachePolicy,
	query,
	RivaScopeError,
	signal,
} from '@softistx/riva';
import { Component, type ReactNode, Suspense } from 'react';
import { deferred, flush, h, mount, newRiva } from '../test/render';
import { RivaProvider } from './context';
import { useQuery } from './use-query';

const users = (
	id: string,
	fetch: (vars: { school: string }) => Promise<string>,
) => query<{ school: string }, string>({ id, retry: 0, fetch });

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

test('goes loading then success, and refetch marks it stale and fetches', async () => {
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
	const m = await mount(h(C), newRiva());
	expect(m.text()).toBe('loading:-');
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
	const m = await mount(h(C), newRiva());
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
	const riva = newRiva();
	const container = document.createElement('div');
	const { createRoot } = await import('react-dom/client');
	const { act } = await import('react');
	const root = createRoot(container);
	const ui = (s: string) =>
		h(RivaProvider, { riva }, h(Show, { def, school: s }));
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
	const m = await mount(h(C), newRiva());
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
	const riva = newRiva();
	const { createRoot } = await import('react-dom/client');
	const { act } = await import('react');
	const container = document.createElement('div');
	const root = createRoot(container);
	const ui = (enabled: boolean) =>
		h(RivaProvider, { riva }, h(Show, { def, school: 's', opts: { enabled } }));
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
	const riva = newRiva();
	const m = await mount(h(C), riva);
	await flush();
	expect(m.text()).toBe('1');
	await m.unmount();
	expect(riva.queries.state(def, undefined).data).toBe(1);
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
		newRiva(),
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
		newRiva(),
	);
	await flush();
	expect(m.text()).toBe('caught:bad');
	await m.unmount();
	log.mockRestore();
});

test('suspense with data already cached renders at once', async () => {
	const def = users('uq/suspense-hot', async () => 'cold');
	const riva = newRiva();
	def.setData(riva, { school: 's' }, 'hot');
	function C() {
		return h(
			'p',
			null,
			useQuery(def, { school: 's' }, { suspense: true }).data,
		);
	}
	const m = await mount(
		h(Suspense, { fallback: h('p', null, 'loading') }, h(C)),
		riva,
	);
	expect(m.text()).toBe('hot');
	await m.unmount();
});

test('suspense suspends again while an observed hidden entity is refetched', async () => {
	const holes = signal(false);
	const cache: CachePolicy<unknown> = {
		write: (_c, data) => data,
		read: (c, stored) => (c.get(holes) ? undefined : stored),
		release: () => {},
	};
	const riva = newRiva();
	let calls = 0;
	const def = query<{ school: string }, string>({
		id: 'uq/suspense-evict',
		retry: 0,
		cache,
		fetch: async () => {
			calls++;
			riva.set(holes, false);
			return `v${calls}`;
		},
	});
	function C() {
		const q = useQuery(def, { school: 's' }, { suspense: true });
		return h('p', null, `got:${q.data.toUpperCase()}`);
	}
	const m = await mount(
		h(Suspense, { fallback: h('p', null, 'loading') }, h(C)),
		riva,
	);
	await flush();
	expect(m.text()).toBe('got:V1');
	await flush(() => riva.set(holes, true));
	await flush();
	expect(calls).toBe(2);
	expect(m.text()).toBe('got:V2');
	await m.unmount();
});

test('a fresh suspense mount after an eviction never renders undefined data', async () => {
	const holes = signal(false);
	const cache: CachePolicy<unknown> = {
		write: (_c, data) => data,
		read: (c, stored) => (c.get(holes) ? undefined : stored),
		release: () => {},
	};
	const riva = newRiva();
	let calls = 0;
	const def = query<{ school: string }, string>({
		id: 'uq/suspense-fresh',
		retry: 0,
		cache,
		fetch: async () => {
			calls++;
			riva.set(holes, false);
			return `v${calls}`;
		},
	});
	await def.ensure(riva, { school: 's' });
	riva.set(holes, true);
	const seen: unknown[] = [];
	function C() {
		const q = useQuery(def, { school: 's' }, { suspense: true });
		seen.push(q.data);
		return h('p', null, `got:${q.data}`);
	}
	const m = await mount(
		h(Suspense, { fallback: h('p', null, 'loading') }, h(C)),
		riva,
	);
	await flush();
	expect(seen).not.toContain(undefined);
	expect(m.text()).toBe('got:v2');
	await m.unmount();
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

test('a Suspense mount fetches once at the default staleTime', async () => {
	let calls = 0;
	const def = users('uq/suspense-once', async () => {
		calls++;
		return 'x';
	});
	function C() {
		return h(
			'p',
			null,
			useQuery(def, { school: 's' }, { suspense: true }).data,
		);
	}
	const m = await mount(
		h(Suspense, { fallback: h('p', null, 'loading') }, h(C)),
		newRiva(),
	);
	await flush();
	await flush();
	expect(m.text()).toBe('x');
	expect(calls).toBe(1);
	await m.unmount();
});

test("a Suspense mount trusts the definition's own staleTime", async () => {
	const def = query<{ school: string }, string>({
		id: 'uq/suspense-def-stale',
		retry: 0,
		staleTime: '5m',
		fetch: async () => 'x',
	});
	const riva = newRiva();
	const sub = spyOn(riva, 'subscribe');
	function C() {
		return h(
			'p',
			null,
			useQuery(def, { school: 's' }, { suspense: true }).data,
		);
	}
	const m = await mount(
		h(Suspense, { fallback: h('p', null, 'loading') }, h(C)),
		riva,
	);
	await flush();
	await flush();
	expect(m.text()).toBe('x');
	const opts = (sub.mock.calls as unknown[][]).map((c) => c[3]);
	expect(opts).toContainEqual({ staleTime: 300_000 });
	await m.unmount();
});

test('a suspense query that resolves undefined fetches once, with no loop', async () => {
	const riva = newRiva();
	let calls = 0;
	const def = query<{ school: string }, string | undefined>({
		id: 'uq/suspense-undefined',
		retry: 0,
		fetch: async () => {
			calls++;
			return undefined;
		},
	});
	const seen: unknown[] = [];
	function C() {
		const q = useQuery(def, { school: 's' }, { suspense: true });
		seen.push(q.data);
		return h('p', null, 'done');
	}
	const m = await mount(
		h(Suspense, { fallback: h('p', null, 'loading') }, h(C)),
		riva,
	);
	await flush();
	await flush();
	await flush();
	expect(calls).toBe(1);
	expect(seen).toContain(undefined);
	expect(m.text()).toBe('done');
	await m.unmount();
});
