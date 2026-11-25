import { expect, test } from 'bun:test';
import { createRivaClient, RivaError } from '@softistx/riva';
import { store } from '@softistx/riva/store';
import { act, memo, useMemo, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { h, mount, newClient } from '../../test/render';
import { RivaProvider } from '../context';
import { useStore } from './use-store';

const Books = store({
	name: 'react-books',
	state: { items: [] as string[], filter: '', other: 0 },
	computed: { total: (s) => s.items.length },
	actions: {
		add(s, title: string) {
			s.items = [...s.items, title];
		},
		filterBy(s, q: string) {
			s.filter = q;
		},
		bump(s) {
			s.other += 1;
		},
	},
});

test('useStore reads state and computeds and re-renders when a read key changes', async () => {
	const client = newClient();
	let add!: (title: string) => void;
	let renders = 0;
	function List() {
		const [s, actions] = useStore(Books);
		add = actions.add;
		renders++;
		return h('p', null, `${s.total}:${s.items.join(',')}`);
	}
	const m = await mount(h(List), client);
	expect(m.text()).toBe('0:');
	await act(async () => add('x'));
	expect(m.text()).toBe('1:x');
	await act(async () => add('y'));
	expect(m.text()).toBe('2:x,y');
	expect(renders).toBe(3);
	await m.unmount();
});

test('a component re-renders only when a key it read changes', async () => {
	const client = newClient();
	let renders = 0;
	function OnlyFilter() {
		const [s] = useStore(Books);
		renders++;
		return h('p', null, s.filter || '-');
	}
	const m = await mount(h(OnlyFilter), client);
	const base = renders;
	await act(async () => Books.bind(client)[1].add('a'));
	await act(async () => Books.bind(client)[1].bump());
	expect(renders).toBe(base);
	await act(async () => Books.bind(client)[1].filterBy('q'));
	expect(m.text()).toBe('q');
	expect(renders).toBe(base + 1);
	await m.unmount();
});

test('the keys read follow the render: a key read later is watched', async () => {
	const client = newClient();
	function Toggle() {
		const [s] = useStore(Books);
		return h('p', null, s.filter === '' ? 'none' : `items=${s.items.length}`);
	}
	const m = await mount(h(Toggle), client);
	await act(async () => Books.bind(client)[1].filterBy('on'));
	expect(m.text()).toBe('items=0');
	await act(async () => Books.bind(client)[1].add('a'));
	expect(m.text()).toBe('items=1');
	await m.unmount();
});

test('the actions are bound to the provider client and keep their identity', async () => {
	const one = newClient();
	const two = newClient();
	const seen: unknown[] = [];
	function C() {
		const [, a] = useStore(Books);
		seen.push(a);
		return null;
	}
	const m = await mount(h(C), one);
	await act(async () => Books.bind(one)[1].bump());
	expect(new Set(seen).size).toBe(1);
	expect(seen[0]).toBe(Books.bind(one)[1]);
	expect(seen[0]).not.toBe(Books.bind(two)[1]);
	await m.unmount();
});

test('two components share the store and the changes reach both', async () => {
	const client = newClient();
	function Count() {
		return h('b', null, useStore(Books)[0].total);
	}
	function Writer() {
		const [, a] = useStore(Books);
		return h('button', { onClick: () => a.add('z') }, 'add');
	}
	const m = await mount(h('div', null, h(Count), h(Writer)), client);
	await act(async () => m.container.querySelector('button')?.click());
	expect(m.container.querySelector('b')?.textContent).toBe('1');
	await m.unmount();
});

test('s refuses a write in a component', async () => {
	const client = newClient();
	let write!: () => void;
	function C() {
		const [s] = useStore(Books);
		write = () => {
			(s as { filter: string }).filter = 'x';
		};
		return null;
	}
	const m = await mount(h(C), client);
	try {
		write();
		throw new Error('no refusal');
	} catch (e) {
		expect(e).toBeInstanceOf(RivaError);
		expect((e as RivaError).code).toBe('RIVA_STORE');
		expect((e as RivaError).message).toBe(
			'Store "react-books": "filter" is read-only here; write it in an action.',
		);
	}
	await m.unmount();
});

test('a store with no provider throws a RivaScopeError', () => {
	function C() {
		useStore(Books);
		return null;
	}
	expect(() => renderToString(h(C))).toThrow(/No RivaClient in scope/);
});

test('renderToString reads the server client state', () => {
	const client = createRivaClient();
	Books.bind(client)[1].add('server');
	function C() {
		const [s] = useStore(Books);
		return h('p', null, `${s.total}:${s.items[0]}`);
	}
	const out = renderToString(h(RivaProvider, { client }, h(C)));
	expect(out).toContain('1:server');
});

test('s is a new object after a change, so useMemo([s]) follows it', async () => {
	const client = newClient();
	let computes = 0;
	function Memo() {
		const [s] = useStore(Books);
		const label = useMemo(() => {
			computes++;
			return `n=${s.items.length}`;
		}, [s]);
		return h('p', null, label);
	}
	const m = await mount(h(Memo), client);
	expect(m.text()).toBe('n=0');
	await act(async () => Books.bind(client)[1].add('a'));
	expect(m.text()).toBe('n=1');
	expect(computes).toBe(2);
	await m.unmount();
});

test('a memoised child that reads s keeps being watched, and follows a change', async () => {
	const client = newClient();
	let childRenders = 0;
	const Child = memo(function Child({ s }: { s: { filter: string } }) {
		childRenders++;
		return h('i', null, s.filter || '-');
	});
	let rerender!: () => void;
	function Parent() {
		const [s] = useStore(Books);
		const [, setN] = useState(0);
		rerender = () => setN((n) => n + 1);
		return h(
			'div',
			null,
			h(Child, { s }),
			h('b', null, String(s.items.length)),
		);
	}
	const m = await mount(h(Parent), client);
	// an unrelated parent render does not drop what the child read
	await act(async () => rerender());
	expect(childRenders).toBe(1);
	await act(async () => Books.bind(client)[1].filterBy('q'));
	expect(m.text()).toBe('q0');
	expect(childRenders).toBe(2);
	await m.unmount();
});
