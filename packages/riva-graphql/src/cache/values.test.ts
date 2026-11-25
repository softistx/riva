import { describe, expect, test } from 'bun:test';
import { RivaError } from '@softistx/riva';
import { assertJson, mergeValues } from './values';

describe('assertJson', () => {
	test('accepts JSON, the same object twice included', () => {
		const shared = { a: 1 };
		expect(() =>
			assertJson({ x: [null, 'a', true, 1.5, shared, shared] }, 'f'),
		).not.toThrow();
	});

	test('refuses what JSON cannot hold, naming the field', () => {
		const refusal = (v: unknown): unknown => {
			try {
				assertJson(v, 'visits({"n":1})');
			} catch (e) {
				return e;
			}
			return undefined;
		};
		for (const [value, what] of [
			[new Date(0), 'Date'],
			[new Map(), 'Map'],
			[undefined, 'undefined'],
			[() => 1, 'function'],
			[1n, 'bigint'],
			[Number.NaN, 'NaN'],
			[Number.POSITIVE_INFINITY, 'Infinity'],
		] as const) {
			const e = refusal({ nested: [value] });
			expect(e).toBeInstanceOf(RivaError);
			expect((e as RivaError).code).toBe('RIVA_CACHE');
			expect((e as Error).message).toBe(
				`The GraphQL cache holds JSON: field visits({"n":1}) holds ${what}.`,
			);
		}
	});

	test('refuses a cycle', () => {
		const a: Record<string, unknown> = {};
		a['self'] = a;
		expect(() => assertJson(a, 'f')).toThrow('holds a cycle');
	});
});

describe('mergeValues', () => {
	test('merges objects and same-length lists, without changing either side', () => {
		const a = { x: { p: 1 }, l: [{ a: 1 }, { a: 2 }], keep: 1 };
		const b = { x: { q: 2 }, l: [{ b: 1 }, { b: 2 }], other: 3 };
		expect(mergeValues(a, b)).toEqual({
			x: { p: 1, q: 2 },
			l: [
				{ a: 1, b: 1 },
				{ a: 2, b: 2 },
			],
			keep: 1,
			other: 3,
		});
		expect(a).toEqual({ x: { p: 1 }, l: [{ a: 1 }, { a: 2 }], keep: 1 });
	});

	test('otherwise the second wins', () => {
		expect(mergeValues([1], [1, 2])).toEqual([1, 2]);
		expect(mergeValues({ a: 1 }, 'x')).toBe('x');
	});
});
