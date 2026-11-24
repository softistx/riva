import { expect, test } from 'bun:test';
import { persistedIdOf } from './persisted-id';

test('is the lowercase hex SHA-256 of the text', async () => {
	expect(await persistedIdOf('abc')).toBe(
		'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
	);
	expect(await persistedIdOf('')).toBe(
		'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
	);
});

test('matches graphql-client apq hashing of the same text', async () => {
	const text = 'query Patients { patients { id } }';
	const expected = new Bun.CryptoHasher('sha256').update(text).digest('hex');
	expect(await persistedIdOf(text)).toBe(expected);
});
