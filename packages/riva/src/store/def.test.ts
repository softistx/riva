import { describe, expect, test } from 'bun:test';
import { createRiva } from '../client';
import { signal } from '../signal';
import { freeze, put, RESERVED, writable } from './def';

describe('freeze', () => {
	test('freezes a value and what it holds (dev), once', () => {
		const v = freeze({ a: [{ b: 1 }] });
		expect(Object.isFrozen(v)).toBe(true);
		expect(Object.isFrozen(v.a)).toBe(true);
		expect(Object.isFrozen(v.a[0])).toBe(true);
		expect(freeze(3)).toBe(3);
		expect(freeze(null)).toBe(null);
	});
});

describe('put', () => {
	test('writes through the guard and lowers it, even when the write throws', () => {
		const c = createRiva();
		const seen: boolean[] = [];
		const sig = signal(0, {
			equals: (a, b) => {
				seen.push(writable());
				return Object.is(a, b);
			},
		});
		expect(writable()).toBe(false);
		put(c, sig as never, 1);
		expect(c.get(sig)).toBe(1);
		expect(seen).toEqual([true]);
		expect(writable()).toBe(false);
		const bad = signal(0, {
			equals: () => {
				throw new Error('x');
			},
		});
		expect(() => put(c, bad as never, 1)).toThrow('x');
		expect(writable()).toBe(false);
	});
});

test('the reserved keys', () => {
	expect(RESERVED).toEqual(['kind', 'name', 'reset', 'bind', 'then']);
});
