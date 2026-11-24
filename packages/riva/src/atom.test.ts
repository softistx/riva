import { expect, test } from 'bun:test';
import { atom } from './atom';
import { createRivaClient } from './client';

test('is a frozen stateless definition with its initial value', () => {
	const a = atom(3, { name: 'n' });
	expect(Object.isFrozen(a)).toBe(true);
	expect(a.kind).toBe('atom');
	expect(a.initial).toBe(3);
	expect(a.name).toBe('n');
	expect(a.ssr).toBe(true);
	expect(atom(1, { ssr: false }).ssr).toBe(false);
	expect(createRivaClient().get(a)).toBe(3);
});

test('set with a value and with an updater', () => {
	const a = atom(1);
	const c = createRivaClient();
	c.set(a, 5);
	expect(c.get(a)).toBe(5);
	c.set(a, (p) => p + 1);
	expect(c.get(a)).toBe(6);
});

test('equals suppresses notifications', () => {
	const a = atom({ id: 1 }, { equals: (x, y) => x.id === y.id });
	const c = createRivaClient();
	const seen: number[] = [];
	c.subscribe(a, (v) => seen.push(v.id));
	c.set(a, { id: 1 });
	c.set(a, { id: 2 });
	expect(seen).toEqual([2]);
	const b = atom(1);
	let n = 0;
	c.subscribe(b, () => n++);
	c.set(b, 1);
	expect(n).toBe(0);
});

test('subscribe notifies synchronously and unsubscribes', () => {
	const a = atom(0);
	const c = createRivaClient();
	const seen: number[] = [];
	const off = c.subscribe(a, (v) => seen.push(v));
	c.set(a, 1);
	off();
	off();
	c.set(a, 2);
	expect(seen).toEqual([1]);
});

test('ambient methods go through the client in scope', () => {
	const a = atom(0);
	const c = createRivaClient();
	const seen: number[] = [];
	c.run(() => {
		a.subscribe((v) => seen.push(v));
		a.set(1);
		a.set((p) => p + 1);
	});
	expect(seen).toEqual([1, 2]);
});

test('two clients never share values', () => {
	const a = atom(0);
	const c1 = createRivaClient();
	const c2 = createRivaClient();
	c1.set(a, 10);
	expect(c1.get(a)).toBe(10);
	expect(c2.get(a)).toBe(0);
	const seen: number[] = [];
	c2.subscribe(a, (v) => seen.push(v));
	c1.set(a, 11);
	expect(seen).toEqual([]);
});
