import { expect, test } from 'bun:test';
import type { RivaError } from './errors';
import { stableKey } from './key';

const code = (fn: () => unknown): string | undefined => {
	try {
		fn();
	} catch (e) {
		return (e as RivaError).code;
	}
	return undefined;
};

test('no variables gives a stable id: key', () => {
	expect(stableKey('a', undefined)).toBe('a:');
	expect(stableKey('a', undefined)).toBe(stableKey('a', undefined));
	expect(stableKey('a', null)).toBe('a:null');
});

test('object key order does not matter, nested too', () => {
	expect(stableKey('a', { x: 1, y: { b: 2, a: 1 } })).toBe(
		stableKey('a', { y: { a: 1, b: 2 }, x: 1 }),
	);
});

test('undefined properties are dropped, array order is kept', () => {
	expect(stableKey('a', { x: 1, y: undefined })).toBe(stableKey('a', { x: 1 }));
	expect(stableKey('a', [1, 2])).not.toBe(stableKey('a', [2, 1]));
	expect(stableKey('a', [undefined])).toBe('a:[null]');
});

test('different values give different keys; ids are part of the key', () => {
	expect(stableKey('a', { x: 1 })).not.toBe(stableKey('a', { x: 2 }));
	expect(stableKey('a', { x: '1' })).not.toBe(stableKey('a', { x: 1 }));
	expect(stableKey('a', 1)).not.toBe(stableKey('b', 1));
});

test('Date becomes its ISO string', () => {
	const d = new Date('2026-01-02T03:04:05.000Z');
	expect(stableKey('a', { d })).toBe('a:{"d":"2026-01-02T03:04:05.000Z"}');
	expect(code(() => stableKey('a', new Date('x')))).toBe('RIVA_KEY');
});

test('a shared (non-circular) reference is fine', () => {
	const shared = { n: 1 };
	expect(stableKey('a', [shared, shared])).toBe('a:[{"n":1},{"n":1}]');
});

test('function, symbol, bigint, NaN and cycles throw RIVA_KEY', () => {
	expect(code(() => stableKey('a', { f: () => 1 }))).toBe('RIVA_KEY');
	expect(code(() => stableKey('a', Symbol('s')))).toBe('RIVA_KEY');
	expect(code(() => stableKey('a', 1n))).toBe('RIVA_KEY');
	expect(code(() => stableKey('a', Number.NaN))).toBe('RIVA_KEY');
	const c: Record<string, unknown> = {};
	c['self'] = c;
	expect(code(() => stableKey('a', c))).toBe('RIVA_KEY');
});
