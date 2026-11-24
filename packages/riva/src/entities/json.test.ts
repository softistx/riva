import { expect, test } from 'bun:test';
import { equal, isPlain, isRef, refsIn, share } from './json';

test('isPlain: literals and null-prototype objects only', () => {
	expect(isPlain({})).toBe(true);
	expect(isPlain(Object.create(null))).toBe(true);
	expect(isPlain([])).toBe(false);
	expect(isPlain(new Date())).toBe(false);
	expect(isPlain(new (class A {})())).toBe(false);
	expect(isPlain(null)).toBe(false);
});

test('isRef', () => {
	expect(isRef({ __ref: 'A:1' })).toBe(true);
	expect(isRef({ __ref: 1 })).toBe(false);
	expect(isRef('A:1')).toBe(false);
});

test('equal: deep, order of keys free, dates by time', () => {
	expect(equal({ a: [1, { b: 2 }], c: 1 }, { c: 1, a: [1, { b: 2 }] })).toBe(
		true,
	);
	expect(equal({ a: 1 }, { a: 1, b: undefined })).toBe(false);
	expect(equal([1], { 0: 1 })).toBe(false);
	expect(equal(new Date(5), new Date(5))).toBe(true);
	expect(equal(new Date(5), new Date(6))).toBe(false);
	expect(equal(null, {})).toBe(false);
});

test('share keeps the identity of what is equal, at any depth', () => {
	const prev = { a: [1, 2], b: { c: 1 }, d: 'x' };
	expect(share(prev, { a: [1, 2], b: { c: 1 }, d: 'x' })).toBe(prev);
	const next = share(prev, { a: [1, 2], b: { c: 2 }, d: 'x' }) as typeof prev;
	expect(next).not.toBe(prev);
	expect(next.a).toBe(prev.a);
	expect(share([1], [1, 2])).toEqual([1, 2]);
	expect(share([1], { 0: 1 })).toEqual({ 0: 1 });
	const d = new Date(1);
	expect(share(d, new Date(1))).toBe(d);
	expect(share(undefined, 3)).toBe(3);
});

test('refsIn finds refs in arrays and nested objects, duplicates kept', () => {
	expect(
		refsIn({
			a: { __ref: 'A:1' },
			b: [{ __ref: 'B:1' }, { x: { __ref: 'A:1' } }],
			c: 1,
		}),
	).toEqual(['A:1', 'B:1', 'A:1']);
	expect(refsIn(new Date())).toEqual([]);
});
