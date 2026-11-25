import { expect, test } from 'bun:test';
import { createRiva } from './client';
import { signal } from './signal';

test('is a frozen stateless definition with its initial value', () => {
	const a = signal(3, { name: 'n' });
	expect(Object.isFrozen(a)).toBe(true);
	expect(a.kind).toBe('signal');
	expect(a.initial).toBe(3);
	expect(a.name).toBe('n');
	expect(a.ssr).toBe(false);
	expect(signal(1, { ssr: true }).ssr).toBe(true);
	expect(createRiva().get(a)).toBe(3);
});

test('set with a value and with an updater', () => {
	const a = signal(1);
	const c = createRiva();
	c.set(a, 5);
	expect(c.get(a)).toBe(5);
	c.set(a, (p) => p + 1);
	expect(c.get(a)).toBe(6);
});

test('equals suppresses notifications', () => {
	const a = signal({ id: 1 }, { equals: (x, y) => x.id === y.id });
	const c = createRiva();
	const seen: number[] = [];
	c.subscribe(a, (v) => seen.push(v.id));
	c.set(a, { id: 1 });
	c.set(a, { id: 2 });
	expect(seen).toEqual([2]);
	const b = signal(1);
	let n = 0;
	c.subscribe(b, () => n++);
	c.set(b, 1);
	expect(n).toBe(0);
});

test('subscribe notifies synchronously and unsubscribes', () => {
	const a = signal(0);
	const c = createRiva();
	const seen: number[] = [];
	const off = c.subscribe(a, (v) => seen.push(v));
	c.set(a, 1);
	off();
	off();
	c.set(a, 2);
	expect(seen).toEqual([1]);
});

test('ambient methods go through the riva in scope', () => {
	const a = signal(0);
	const c = createRiva();
	const seen: number[] = [];
	c.run(() => {
		a.subscribe((v) => seen.push(v));
		a.set(1);
		a.set((p) => p + 1);
	});
	expect(seen).toEqual([1, 2]);
});

test('two riva instances never share values', () => {
	const a = signal(0);
	const c1 = createRiva();
	const c2 = createRiva();
	c1.set(a, 10);
	expect(c1.get(a)).toBe(10);
	expect(c2.get(a)).toBe(0);
	const seen: number[] = [];
	c2.subscribe(a, (v) => seen.push(v));
	c1.set(a, 11);
	expect(seen).toEqual([]);
});
