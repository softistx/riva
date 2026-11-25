import { expect, test } from 'bun:test';
import { query } from '@softistx/riva';
import { entities, writeEntity } from '@softistx/riva/entities';
import { act } from 'react';
import { flush, h, mount, newRiva } from '../../test/render';
import { useFragment } from './use-fragment';

// biome-ignore lint/style/useNamingConvention: GraphQL's field name
type Patient = { __typename: 'Patient'; id: string; name: string; age: number };

const list = query<void, { patients: Patient[] }>({
	id: 'frag/list',
	cache: entities(),
	staleTime: '1h',
	retry: 0,
	fetch: async () => ({
		patients: [
			{ __typename: 'Patient', id: '1', name: 'Ana', age: 30 },
			{ __typename: 'Patient', id: '2', name: 'Bob', age: 40 },
		],
	}),
});

test('reads an entity and re-renders when it changes, and only then', async () => {
	const riva = newRiva();
	await list.ensure(riva);
	let renders = 0;
	function C() {
		const p = useFragment<Patient>('Patient:1');
		renders++;
		return h('p', null, p ? `${p.name}:${p.age}` : 'missing');
	}
	const m = await mount(h(C), riva);
	expect(m.text()).toBe('Ana:30');
	const base = renders;
	await act(async () => writeEntity(riva, 'Patient:2', { name: 'Bobby' }));
	expect(renders).toBe(base);
	await act(async () => writeEntity(riva, 'Patient:1', { age: 31 }));
	expect(m.text()).toBe('Ana:31');
	expect(renders).toBe(base + 1);
	await act(async () => writeEntity(riva, 'Patient:1', { age: 31 }));
	expect(renders).toBe(base + 1);
	await m.unmount();
});

test('a missing entity or an empty ref reads undefined, and appears once written', async () => {
	const riva = newRiva();
	function C({ ref }: { ref: string | null }) {
		const p = useFragment<Patient>(ref);
		return h('p', null, p ? p.name : 'missing');
	}
	const a = await mount(h(C, { ref: null }), riva);
	expect(a.text()).toBe('missing');
	const b = await mount(h(C, { ref: 'Patient:9' }), riva);
	expect(b.text()).toBe('missing');
	await flush(() =>
		writeEntity(riva, 'Patient:9', {
			__typename: 'Patient',
			id: '9',
			name: 'Zed',
		}),
	);
	expect(b.text()).toBe('Zed');
	expect(a.text()).toBe('missing');
	await a.unmount();
	await b.unmount();
});
