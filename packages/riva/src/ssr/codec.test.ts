import { describe, expect, test } from 'bun:test';
import { RivaError } from '../errors';
import { decode, encode } from './codec';

const roundTrip = (v: unknown) => decode(JSON.parse(JSON.stringify(encode(v))));

describe('round trips through JSON', () => {
	test('JSON values stay as they are', () => {
		const v = { a: [1, 'x', null, true, { b: 2.5 }], c: '' };
		expect(encode(v)).toEqual(v);
		expect(roundTrip(v)).toEqual(v);
	});

	test('a Date comes back a Date', () => {
		const d = new Date('2026-01-02T03:04:05.678Z');
		const back = roundTrip({ issuedAt: d, list: [d] }) as {
			issuedAt: Date;
			list: Date[];
		};
		expect(back.issuedAt).toBeInstanceOf(Date);
		expect(back.issuedAt.getTime()).toBe(d.getTime());
		expect(back.list[0]).toBeInstanceOf(Date);
	});

	test('NaN and the infinities survive', () => {
		const back = roundTrip([Number.NaN, Infinity, -Infinity, 1]) as number[];
		expect(back[0]).toBeNaN();
		expect(back.slice(1)).toEqual([Infinity, -Infinity, 1]);
	});

	test('an object with its own $t key is escaped', () => {
		const v = { $t: 'D', v: 'not a date', other: { $t: 'N', v: 'NaN' } };
		expect(encode(v)).toEqual({
			$t: 'O',
			v: { ...v, other: { $t: 'O', v: v.other } },
		});
		expect(roundTrip(v)).toEqual(v);
	});

	test('a __proto__ key stays data', () => {
		const v = JSON.parse('{"__proto__":{"polluted":true},"a":1}');
		const back = roundTrip(v) as Record<string, unknown>;
		expect(Object.hasOwn(back, '__proto__')).toBe(true);
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
		expect(Object.getPrototypeOf(back)).toBe(Object.prototype);
	});

	test('undefined follows JSON', () => {
		expect(encode({ a: undefined })).toEqual({ a: undefined });
		expect(encode(undefined)).toBeUndefined();
	});

	test('objects without a prototype are plain', () => {
		const o = Object.create(null) as Record<string, unknown>;
		o['a'] = 1;
		expect(roundTrip(o)).toEqual({ a: 1 });
	});
});

describe('refusals name the value and its path', () => {
	const refused = (v: unknown): RivaError => {
		try {
			encode(v);
		} catch (e) {
			return e as RivaError;
		}
		throw new Error('not refused');
	};

	test.each([
		[{ a: [{ n: 1n }] }, 'a bigint', '$.a[0].n'],
		[{ f: () => 1 }, 'a function', '$.f'],
		[{ s: Symbol('x') }, 'a symbol', '$.s'],
		[{ m: new Map() }, 'an instance of Map', '$.m'],
		[[new Set()], 'an instance of Set', '$[0]'],
		[{ x: new (class Money {})() }, 'an instance of Money', '$.x'],
	])('%p', (v, what, path) => {
		const e = refused(v);
		expect(e).toBeInstanceOf(RivaError);
		expect(e.code).toBe('RIVA_SSR');
		expect(e.message).toBe(
			`Cannot dehydrate ${what} at ${path}: snapshots hold JSON values and Dates. Convert it in the fetch, or keep it out of the cache.`,
		);
	});

	test('an object with a constructor key is plain JSON', () => {
		expect(encode({ constructor: 'x' })).toEqual({ constructor: 'x' });
		expect(decode(encode({ constructor: 'x' }))).toEqual({ constructor: 'x' });
		expect(encode(Object.create(null))).toEqual({});
	});

	test('an invalid Date round-trips as an invalid Date', () => {
		const wire = encode({ d: new Date('nope') });
		expect(wire).toEqual({ d: { $t: 'D', v: 'NaN' } });
		const back = decode(wire) as { d: Date };
		expect(back.d).toBeInstanceOf(Date);
		expect(Number.isNaN(+back.d)).toBe(true);
	});

	test('a cycle is refused, a shared reference is not', () => {
		const a: Record<string, unknown> = { n: 1 };
		a['self'] = a;
		expect(refused({ a }).message).toContain('a cycle at $.a.self');
		const shared = { n: 1 };
		expect(encode([shared, shared])).toEqual([{ n: 1 }, { n: 1 }]);
	});
});
