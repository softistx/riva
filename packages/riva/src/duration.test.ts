import { expect, test } from 'bun:test';
import { toMs } from './duration';
import { RivaError } from './errors';

test('numbers are milliseconds, Infinity allowed', () => {
	expect(toMs(0)).toBe(0);
	expect(toMs(1500)).toBe(1500);
	expect(toMs(Infinity)).toBe(Infinity);
});

test('strings with a unit', () => {
	expect(toMs('250ms')).toBe(250);
	expect(toMs('30s')).toBe(30_000);
	expect(toMs('5m')).toBe(300_000);
	expect(toMs('2h')).toBe(7_200_000);
	expect(toMs('1.5s')).toBe(1500);
});

test('a bad duration throws RIVA_DURATION', () => {
	for (const bad of ['30', 'abc', '-5s', '5 s', '5d', '', -1, Number.NaN]) {
		try {
			toMs(bad as never);
			throw new Error('no throw');
		} catch (e) {
			expect(e).toBeInstanceOf(RivaError);
			expect((e as RivaError).code).toBe('RIVA_DURATION');
		}
	}
});
