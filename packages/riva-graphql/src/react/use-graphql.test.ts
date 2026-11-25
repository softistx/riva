/* biome-ignore-all lint/style/useNamingConvention: GraphQL's field names */
import '../../test/happydom';
import { expect, expectTypeOf, test } from 'bun:test';
import { ApiError } from '@softistx/graphql-client';
import { createRiva, signal } from '@softistx/riva';
import type { ResourceState } from '@softistx/riva/resource';
import { RivaProvider } from '@softistx/riva-react';
import { Component, type ReactNode, Suspense } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import {
	fakeTransport,
	PATIENTS_QUERY,
	VIEWER_QUERY,
} from '../../test/fixtures';
import { deferred, flush, h, mount } from '../../test/render';
import { GraphQLError, toRivaError } from '../errors';
import { graphql } from '../simple';
import { type UseGraphQLOptions, useGraphQL } from './use-graphql';

const refused = toRivaError(new ApiError([{ message: 'No' }], undefined, 400));
const viewer = (id = '1') => ({ viewer: { id } });
const show = (s: ResourceState<unknown>) =>
	`${s.status}:${JSON.stringify(s.data ?? null)}:${s.placeholder}`;

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

test('goes loading then success', async () => {
	const gate = deferred<void>();
	const t = fakeTransport(async () => {
		await gate.promise;
		return viewer();
	});
	const riva = createRiva({ graphql: graphql(t) });
	function C() {
		const s = useGraphQL(VIEWER_QUERY);
		return h('p', null, show(s));
	}
	const m = await mount(h(C), riva);
	expect(m.text()).toStartWith('loading');
	await flush(() => gate.resolve());
	expect(m.text()).toBe('success:{"viewer":{"id":"1"}}:false');
	expect(t.calls).toHaveLength(1);
	await m.unmount();
});

test('an error lands in the state; a partial result keeps its data', async () => {
	const partial = toRivaError(
		new ApiError([{ message: 'No access', path: ['viewer'] }], viewer(), 200),
	);
	const riva = createRiva({
		graphql: graphql(
			fakeTransport(() => {
				throw partial;
			}),
		),
	});
	let seen!: ResourceState<unknown>;
	function C() {
		seen = useGraphQL(VIEWER_QUERY);
		return h('p', null, seen.status);
	}
	const m = await mount(h(C), riva);
	await flush();
	expect(m.text()).toBe('error');
	expect(seen.data).toEqual(viewer());
	expect(seen.error).toBeInstanceOf(GraphQLError);
	await m.unmount();

	const plain = createRiva({
		graphql: graphql(
			fakeTransport(() => {
				throw refused;
			}),
		),
	});
	const m2 = await mount(h(C), plain);
	await flush();
	expect(seen.status).toBe('error');
	expect(seen.data).toBeUndefined();
	await m2.unmount();
});

test('enabled false is idle, calls neither the variables function nor the transport', async () => {
	const t = fakeTransport(() => viewer());
	const riva = createRiva({ graphql: graphql(t) });
	let evaluated = 0;
	function C({ on }: { on: boolean }) {
		const s = useGraphQL(
			PATIENTS_QUERY,
			() => {
				evaluated++;
				return { school: 's' };
			},
			{ enabled: on },
		);
		return h('p', null, s.status);
	}
	const m = await mount(h(C, { on: false }), riva);
	await flush();
	expect([m.text(), evaluated, t.calls.length]).toEqual(['idle', 0, 0]);
	await m.rerender(h(C, { on: true }));
	await flush();
	expect(m.text()).toBe('success');
	expect(t.calls).toHaveLength(1);
	await m.unmount();
});

test('a tracked enabled function toggles the fetch', async () => {
	const t = fakeTransport(() => viewer());
	const riva = createRiva({ graphql: graphql(t) });
	const on = signal(false);
	function C() {
		return h(
			'p',
			null,
			useGraphQL(VIEWER_QUERY, undefined, { enabled: () => riva.get(on) })
				.status,
		);
	}
	const m = await mount(h(C), riva);
	await flush();
	expect([m.text(), t.calls.length]).toEqual(['idle', 0]);
	await flush(() => riva.set(on, true));
	expect(m.text()).toBe('success');
	expect(t.calls).toHaveLength(1);
	await m.unmount();
});

test('new variables refetch and keep the previous data as a placeholder', async () => {
	const gates = new Map<string, () => void>();
	const t = fakeTransport(
		(c) =>
			new Promise((resolve) => {
				const school = (c.variables as { school: string }).school;
				gates.set(school, () => resolve({ patients: school }));
			}),
	);
	const riva = createRiva({ graphql: graphql(t) });
	function C({ school, opts }: { school: string; opts?: UseGraphQLOptions }) {
		return h('p', null, show(useGraphQL(PATIENTS_QUERY, { school }, opts)));
	}
	const m = await mount(h(C, { school: 'a' }), riva);
	await flush(() => gates.get('a')?.());
	expect(m.text()).toBe('success:{"patients":"a"}:false');
	await m.rerender(h(C, { school: 'b' }));
	expect(m.text()).toBe('success:{"patients":"a"}:true');
	await flush(() => gates.get('b')?.());
	expect(m.text()).toBe('success:{"patients":"b"}:false');
	await m.rerender(h(C, { school: 'c', opts: { keepPrevious: false } }));
	expect(m.text()).toStartWith('loading:null');
	expect(
		t.calls.map((c) => (c.variables as { school: string }).school),
	).toEqual(['a', 'b', 'c']);
	await m.unmount();
});

test('inline equal variables do not refetch', async () => {
	const t = fakeTransport(() => viewer());
	const riva = createRiva({ graphql: graphql(t) });
	function C() {
		return h('p', null, useGraphQL(PATIENTS_QUERY, { school: 's' }).status);
	}
	const m = await mount(h(C), riva);
	await flush();
	await m.rerender(h(C));
	await flush();
	expect(t.calls).toHaveLength(1);
	await m.unmount();
});

test('suspense waits for the data and the state is success', async () => {
	const gate = deferred<void>();
	const t = fakeTransport(async () => {
		await gate.promise;
		return viewer();
	});
	const riva = createRiva({ graphql: graphql(t) });
	function C() {
		const s = useGraphQL(VIEWER_QUERY, undefined, { suspense: true });
		expectTypeOf(s.status).toEqualTypeOf<'success'>();
		expectTypeOf(s.data).toEqualTypeOf<{ viewer: { id: string } }>();
		return h('p', null, s.data.viewer.id);
	}
	const m = await mount(
		h(Suspense, { fallback: h('p', null, 'wait') }, h(C)),
		riva,
	);
	expect(m.text()).toBe('wait');
	await flush(() => gate.resolve());
	expect(m.text()).toBe('1');
	// What the Suspense render fetched is not fetched again on mount.
	expect(t.calls).toHaveLength(1);
	await m.unmount();
});

test('suspense throws a failure to the error boundary', async () => {
	const riva = createRiva({
		graphql: graphql(
			fakeTransport(() => {
				throw refused;
			}),
		),
	});
	function C() {
		useGraphQL(VIEWER_QUERY, undefined, { suspense: true });
		return null;
	}
	const spy = console.error;
	console.error = () => {};
	try {
		const m = await mount(
			h(Boundary, null, h(Suspense, { fallback: 'wait' }, h(C))),
			riva,
		);
		await flush();
		expect(m.text()).toContain('caught:');
		await m.unmount();
	} finally {
		console.error = spy;
	}
});

test('without a graphql extension it throws a RIVA_DEFINITION error saying how to install it', async () => {
	function C() {
		useGraphQL(VIEWER_QUERY);
		return null;
	}
	const spy = console.error;
	console.error = () => {};
	try {
		await expect(mount(h(C), createRiva())).rejects.toThrow(
			'createRiva({ graphql: graphql(client) })',
		);
		await expect(mount(h(C))).rejects.toThrow('No Riva in scope');
	} finally {
		console.error = spy;
	}
});

test('SSR: a render shows what the loader fetched and a client mount does not refetch it', async () => {
	const t = fakeTransport(() => viewer());
	const riva = createRiva({ graphql: graphql(t) });
	await riva.graphql.query(VIEWER_QUERY);
	expect(t.calls).toHaveLength(1);
	function C() {
		return h(
			'p',
			null,
			show(useGraphQL(VIEWER_QUERY, undefined, { suspense: true })),
		);
	}
	const stream = await renderToReadableStream(
		h(RivaProvider, { riva }, h(Suspense, { fallback: 'wait' }, h(C))),
	);
	await stream.allReady;
	expect(await new Response(stream).text()).toContain(
		'success:{&quot;viewer&quot;:{&quot;id&quot;:&quot;1&quot;}}:false',
	);
	// An empty riva with suspense fetches during the render.
	const fresh = createRiva({
		graphql: graphql(fakeTransport(() => viewer('9'))),
	});
	const s2 = await renderToReadableStream(
		h(RivaProvider, { riva: fresh }, h(Suspense, { fallback: 'wait' }, h(C))),
	);
	await s2.allReady;
	expect(await new Response(s2).text()).toContain('9');
	// Mounting on the seeded riva shows the data at once, and only refetches what is stale.
	const m = await mount(h(C), riva);
	expect(m.text()).toStartWith('success');
	await m.unmount();
	const context = RivaProvider({ riva }).type as unknown as Record<
		string,
		unknown
	>;
	context['_currentRenderer'] = null;
	context['_currentRenderer2'] = null;
});

test('types: data comes from the document', () => {
	const s = {} as ReturnType<
		typeof useGraphQL<{ viewer: { id: string } }, { [k: string]: never }>
	>;
	expectTypeOf(s).toEqualTypeOf<ResourceState<{ viewer: { id: string } }>>();
	if (s.status === 'success')
		expectTypeOf(s.data.viewer.id).toEqualTypeOf<string>();
});
