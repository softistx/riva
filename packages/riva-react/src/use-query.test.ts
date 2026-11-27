import { expect, spyOn, test } from 'bun:test';
import {
	type CachePolicy,
	query,
	RivaScopeError,
	signal,
} from '@softistx/riva';
import { liveQuery } from '@softistx/riva/rxjs';
import { Component, type ReactNode, StrictMode, Suspense } from 'react';
import { Observable, Subject } from 'rxjs';
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

test('suspense on a live query subscribes to its source once', async () => {
	const feed = new Subject<number>();
	let subscribed = 0;
	const def = liveQuery<void, number>({
		id: 'uq/live-suspense',
		retry: 0,
		observe: () =>
			new Observable<number>((sub) => {
				subscribed++;
				return feed.subscribe(sub);
			}),
	});
	function C() {
		const q = useQuery(def, undefined, { suspense: true });
		return h('p', null, `got:${q.data}`);
	}
	const m = await mount(
		h(Suspense, { fallback: h('p', null, 'loading') }, h(C)),
		newRiva(),
	);
	expect(m.text()).toBe('loading');
	await flush(() => feed.next(1));
	await flush();
	expect(m.text()).toBe('got:1');
	expect(subscribed).toBe(1);
	await flush(() => feed.next(2));
	expect(m.text()).toBe('got:2');
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

class Resettable extends Component<
	{ children?: ReactNode; onCatch?: (reset: () => void) => void },
	{ error: Error | undefined }
> {
	override state = { error: undefined as Error | undefined };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	override render() {
		if (!this.state.error) return this.props.children;
		this.props.onCatch?.(() => this.setState({ error: undefined }));
		return h('p', null, `caught:${this.state.error.message}`);
	}
}

test('suspense refetches once when the error boundary resets, and shows a second failure again', async () => {
	const log = spyOn(console, 'error').mockImplementation(() => {});
	let calls = 0;
	const def = users('uq/suspense-reset', async () => {
		calls++;
		if (calls === 1) throw new Error('first');
		return `ok${calls}`;
	});
	function C() {
		const q = useQuery(def, { school: 's' }, { suspense: true });
		return h('p', null, `got:${q.data}`);
	}
	let reset = () => {};
	const m = await mount(
		h(
			Resettable,
			{ onCatch: (r) => (reset = r) },
			h(Suspense, { fallback: h('p', null, 'loading') }, h(C)),
		),
		newRiva(),
	);
	await flush();
	expect(m.text()).toBe('caught:first');
	expect(calls).toBe(1);
	await flush(() => reset());
	expect(m.text()).toBe('got:ok2');
	expect(calls).toBe(2);
	await m.unmount();
	log.mockRestore();
});

test('a synchronous re-render of a failed suspense query does not refetch (StrictMode)', async () => {
	const log = spyOn(console, 'error').mockImplementation(() => {});
	let calls = 0;
	const def = users('uq/suspense-strict', async () => {
		calls++;
		throw new Error('bad');
	});
	function C() {
		useQuery(def, { school: 's' }, { suspense: true });
		return h('p', null, 'unreachable');
	}
	const m = await mount(
		h(
			StrictMode,
			null,
			h(
				Resettable,
				null,
				h(Suspense, { fallback: h('p', null, 'loading') }, h(C)),
			),
		),
		newRiva(),
	);
	await flush();
	expect(m.text()).toBe('caught:bad');
	expect(calls).toBe(1);
	await m.unmount();
	log.mockRestore();
});

test('a failure after a reset reaches the boundary again', async () => {
	const log = spyOn(console, 'error').mockImplementation(() => {});
	let calls = 0;
	const def = users('uq/suspense-reset-fail', async () => {
		calls++;
		throw new Error(`fail${calls}`);
	});
	function C() {
		useQuery(def, { school: 's' }, { suspense: true });
		return h('p', null, 'unreachable');
	}
	let reset = () => {};
	const m = await mount(
		h(
			Resettable,
			{ onCatch: (r) => (reset = r) },
			h(Suspense, { fallback: h('p', null, 'loading') }, h(C)),
		),
		newRiva(),
	);
	await flush();
	expect(m.text()).toBe('caught:fail1');
	await flush(() => reset());
	expect(m.text()).toBe('caught:fail2');
	expect(calls).toBe(2);
	await m.unmount();
	log.mockRestore();
});

test('a live query shows what its stream pushes and unsubscribes on unmount', async () => {
	const feed = new Subject<number>();
	let subscribed = 0;
	let unsubscribed = 0;
	const def = liveQuery<void, number>({
		id: 'uq/live',
		retry: 0,
		observe: () =>
			new Observable<number>((sub) => {
				subscribed++;
				const inner = feed.subscribe(sub);
				return () => {
					unsubscribed++;
					inner.unsubscribe();
				};
			}),
	});
	function Price() {
		const q = useQuery(def);
		return h('p', null, `${q.status}:${q.data ?? '-'}`);
	}
	const m = await mount(h(Price), newRiva());
	expect(m.text()).toBe('loading:-');
	await flush(() => feed.next(1));
	expect(m.text()).toBe('success:1');
	await flush(() => feed.next(2));
	expect(m.text()).toBe('success:2');
	expect(subscribed).toBe(1);
	await m.unmount();
	expect(unsubscribed).toBe(1);
});

/** A query that publishes `parts` through `ctx.onPart`, then resolves with the last gate's value. */
function streamed(id: string) {
	const gate = deferred<{ a: string; b?: string }>();
	let publish: (d: unknown) => void = () => {};
	let calls = 0;
	const def = query<{ school: string }, { a: string; b?: string }>({
		id,
		retry: 0,
		fetch: (_v, ctx) => {
			calls++;
			publish = (d) => ctx.onPart?.(d);
			return gate.promise;
		},
	});
	return { def, gate, part: (d: unknown) => publish(d), calls: () => calls };
}

function Parts({ def }: { def: ReturnType<typeof streamed>['def'] }) {
	const q = useQuery(def, { school: 's' });
	return h(
		'p',
		null,
		`${q.status}:${q.dataState ?? '-'}:${q.data?.a ?? '-'}:${q.data?.b ?? '-'}:${q.isFetching}`,
	);
}

test('renders the first part, then the full data, with no loop in the component', async () => {
	const s = streamed('uq/parts');
	const m = await mount(h(Parts, { def: s.def }), newRiva());
	expect(m.text()).toBe('loading:-:-:-:true');
	await flush(() => s.part({ a: 'fast' }));
	expect(m.text()).toBe('success:streaming:fast:-:true');
	await flush(() => s.gate.resolve({ a: 'fast', b: 'slow' }));
	expect(m.text()).toBe('success:complete:fast:slow:false');
	expect(s.calls()).toBe(1);
	await m.unmount();
});

test('unmounting during the stream aborts it; a part after that is dropped', async () => {
	let ctx: { signal: AbortSignal; onPart?: (d: unknown) => void } | undefined;
	const def = query<{ school: string }, string>({
		id: 'uq/parts-abort',
		retry: 0,
		fetch: (_v, c) => {
			ctx = c;
			return new Promise(() => {});
		},
	});
	const riva = newRiva();
	const m = await mount(h(Show, { def, school: 's' }), riva);
	await flush(() => ctx?.onPart?.('a'));
	expect(m.text()).toBe('success:a:true');
	await m.unmount();
	expect(ctx?.signal.aborted).toBe(true);
	ctx?.onPart?.('late');
	expect(riva.get(def, { school: 's' }).data).toBeUndefined();
	expect(riva.get(def, { school: 's' }).dataState).not.toBe('streaming');
});

test('refetch replaces the stream: the old one is aborted and its parts dropped', async () => {
	const ctxs: Array<{ signal: AbortSignal; onPart?: (d: unknown) => void }> =
		[];
	const gates: Array<ReturnType<typeof deferred<string>>> = [];
	const q2 = query<{ school: string }, string>({
		id: 'uq/parts-refetch2',
		retry: 0,
		fetch: (_v, c) => {
			ctxs.push(c);
			const g = deferred<string>();
			gates.push(g);
			return g.promise;
		},
	});
	let refetch!: () => Promise<void>;
	function C() {
		const q = useQuery(q2, { school: 's' });
		refetch = q.refetch;
		return h('p', null, `${q.data ?? '-'}:${q.dataState ?? '-'}`);
	}
	const m = await mount(h(C), newRiva());
	await flush(() => ctxs[0]?.onPart?.('one'));
	expect(m.text()).toBe('one:streaming');
	await flush(() => void refetch());
	expect(ctxs[0]?.signal.aborted).toBe(true);
	await flush(() => ctxs[0]?.onPart?.('stale'));
	expect(m.text()).toBe('one:streaming');
	await flush(() => ctxs[1]?.onPart?.('two'));
	expect(m.text()).toBe('two:streaming');
	await flush(() => gates[1]?.resolve('two!'));
	expect(m.text()).toBe('two!:complete');
	await m.unmount();
});

test('suspense resolves at the first part; later parts update without suspending again', async () => {
	const s = streamed('uq/parts-suspense');
	let suspended = 0;
	function C() {
		const q = useQuery(s.def, { school: 's' }, { suspense: true });
		return h('p', null, `${q.data.a}:${q.data.b ?? '-'}:${q.dataState ?? '-'}`);
	}
	function Fallback() {
		suspended++;
		return h('p', null, 'loading');
	}
	const m = await mount(
		h(Suspense, { fallback: h(Fallback) }, h(C)),
		newRiva(),
	);
	expect(m.text()).toBe('loading');
	await flush(() => s.part({ a: 'fast' }));
	await flush();
	expect(m.text()).toBe('fast:-:streaming');
	const before = suspended;
	await flush(() => s.gate.resolve({ a: 'fast', b: 'slow' }));
	expect(m.text()).toBe('fast:slow:complete');
	expect(suspended).toBe(before);
	expect(s.calls()).toBe(1);
	await m.unmount();
});
