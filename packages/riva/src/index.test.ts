import { expect, test } from 'bun:test';
import * as api from './index';

test('the main entry exports the riva, the definitions and the errors', () => {
	for (const k of [
		'createRiva',
		'query',
		'mutation',
		'RivaError',
		'isRetryableStatus',
	])
		expect(k in api).toBe(true);
	expect('VERSION' in api).toBe(false);
});
