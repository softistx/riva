import { expect, test } from 'bun:test';
import { RivaError } from '../errors';
import { refuse, view } from './view';

test('refuse throws a RIVA_STORE error', () => {
	try {
		refuse('no');
	} catch (e) {
		expect(e).toBeInstanceOf(RivaError);
		expect((e as RivaError).code).toBe('RIVA_STORE');
		expect((e as RivaError).message).toBe('no');
	}
	expect.assertions(3);
});

test('a view reads and writes its own keys through the callbacks', () => {
	const log: string[] = [];
	const v = view(
		{ a: 1, b: 2 },
		(k) => `read ${k}`,
		(k, x) => void log.push(`${k}=${x}`),
	);
	expect(v['a']).toBe('read a');
	v['b'] = 5;
	expect(log).toEqual(['b=5']);
});

test('an unknown key and a symbol read undefined, even for inherited names', () => {
	const v = view(
		{ a: 1 },
		() => 'x',
		() => {},
	);
	expect(v['zzz']).toBeUndefined();
	expect(v['toString']).toBeUndefined();
	expect(v['then']).toBeUndefined();
	expect((v as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
});

test('the write callback decides: it can refuse', () => {
	const v = view(
		{ a: 1 },
		() => 1,
		(k) => refuse(`no ${k}`),
	);
	expect(() => {
		v['a'] = 2;
	}).toThrow('no a');
});
