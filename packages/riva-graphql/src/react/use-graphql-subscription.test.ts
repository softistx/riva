/* biome-ignore-all lint/style/useNamingConvention: GraphQL's field names */
import '../../test/happydom';
import { expect, expectTypeOf, test } from 'bun:test';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { createRiva, signal } from '@softistx/riva';
import type { ResourceState } from '@softistx/riva/resource';
import { parse } from 'graphql';
import { fakeTransport } from '../../test/fixtures';
import { flush, h, mount } from '../../test/render';
import { graphql } from '../simple';
import type { GraphQLTransport } from '../transport';
import { useGraphQLSubscription } from './use-graphql-subscription';

const SUB = parse(
	'subscription PatientRenamed($school: ID!) { patientRenamed(school: $school) { id name } }',
) as TypedDocumentNode<
	{ patientRenamed: { id: string; name: string } },
	{ school: string }
>;

function streaming() {
	const base = fakeTransport();
	const queue: unknown[] = [];
	let wake: (() => void) | undefined;
	const opened: unknown[] = [];
	let closed = 0;
	const source: GraphQLTransport = {
		execute: base.execute,
		subscribe(_op, vars, { signal }) {
			opened.push(vars);
			signal.addEventListener('abort', () => wake?.());
			return {
				async *[Symbol.asyncIterator]() {
					try {
						for (;;) {
							if (signal.aborted) return;
							if (queue.length) yield queue.shift() as never;
							else await new Promise<void>((r) => (wake = r));
						}
					} finally {
						closed++;
					}
				},
			};
		},
	};
	return {
		source,
		opened,
		closed: () => closed,
		feed(d: unknown) {
			queue.push(d);
			wake?.();
		},
	};
}

const msg = (name: string) => ({ patientRenamed: { id: '1', name } });

test('loading until the first message, then the last one; unmount closes the stream', async () => {
	const s = streaming();
	const riva = createRiva({ graphql: graphql(s.source) });
	const nexts: string[] = [];
	function C() {
		const st = useGraphQLSubscription(
			SUB,
			{ school: 'a' },
			{
				next: (d) => nexts.push(d.patientRenamed.name),
			},
		);
		return h('p', null, `${st.status}:${st.data?.patientRenamed.name ?? '-'}`);
	}
	const m = await mount(h(C), riva);
	await flush();
	expect(m.text()).toBe('loading:-');
	expect(s.opened).toEqual([{ school: 'a' }]);
	await flush(() => s.feed(msg('A')));
	expect(m.text()).toBe('success:A');
	await flush(() => s.feed(msg('B')));
	expect(m.text()).toBe('success:B');
	expect(nexts).toEqual(['A', 'B']);
	await m.unmount();
	await flush();
	expect(s.closed()).toBe(1);
});

test('changed variables restart it; enabled false opens nothing', async () => {
	const s = streaming();
	const riva = createRiva({ graphql: graphql(s.source) });
	function C({ school, on }: { school: string; on: boolean }) {
		const st = useGraphQLSubscription(SUB, { school }, { enabled: on });
		return h('p', null, st.status);
	}
	const m = await mount(h(C, { school: 'a', on: false }), riva);
	await flush();
	expect([m.text(), s.opened.length]).toEqual(['idle', 0]);
	await m.rerender(h(C, { school: 'a', on: true }));
	await flush();
	expect(s.opened).toEqual([{ school: 'a' }]);
	await m.rerender(h(C, { school: 'b', on: true }));
	await flush();
	expect(s.opened).toEqual([{ school: 'a' }, { school: 'b' }]);
	await m.unmount();
});

test('tracked variables restart it', async () => {
	const s = streaming();
	const riva = createRiva({ graphql: graphql(s.source) });
	const school = signal('a');
	function C() {
		useGraphQLSubscription(SUB, () => ({ school: riva.get(school) }));
		return null;
	}
	const m = await mount(h(C), riva);
	await flush();
	await flush(() => riva.set(school, 'b'));
	expect(s.opened).toEqual([{ school: 'a' }, { school: 'b' }]);
	await m.unmount();
});

test('types: data comes from the document', () => {
	const st = {} as ReturnType<
		typeof useGraphQLSubscription<
			{ patientRenamed: { id: string; name: string } },
			{ school: string }
		>
	>;
	expectTypeOf(st).toEqualTypeOf<
		ResourceState<{ patientRenamed: { id: string; name: string } }>
	>();
});
