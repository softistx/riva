import { expect, test } from 'bun:test';
import { signal } from './signal';
import { batch, untracked } from './batch';
import { createRivaClient } from './client';
import { computed } from './computed';

test('batch defers notifications until the outermost batch ends', () => {
	const a = signal(0);
	const b = signal(0);
	const c = createRivaClient();
	const sum = computed((get) => get(a) + get(b));
	const seen: number[] = [];
	c.subscribe(sum, (v) => seen.push(v));
	const r = c.run(() =>
		batch(() => {
			a.set(1);
			batch(() => b.set(2));
			expect(seen).toEqual([]);
			expect(sum.get()).toBe(3);
			return 'ok';
		}),
	);
	expect(r).toBe('ok');
	expect(seen).toEqual([3]);
});

test('batch notifies even when fn throws, and runs fn without a client', () => {
	const a = signal(0);
	const c = createRivaClient();
	const seen: number[] = [];
	c.subscribe(a, (v) => seen.push(v));
	expect(() =>
		c.batch(() => {
			c.set(a, 1);
			throw new Error('x');
		}),
	).toThrow('x');
	expect(seen).toEqual([1]);
	expect(batch(() => 7)).toBe(7);
	expect(untracked(() => 8)).toBe(8);
});

test('untracked reads do not become dependencies', () => {
	const a = signal(1);
	const b = signal(1);
	let calls = 0;
	const d = computed((get) => {
		calls++;
		return get(a) + untracked(() => b.get());
	});
	const c = createRivaClient();
	c.run(() => {
		expect(d.get()).toBe(2);
		b.set(5);
		expect(d.get()).toBe(2);
		expect(calls).toBe(1);
		a.set(2);
		expect(d.get()).toBe(7);
	});
});
