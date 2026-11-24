import { expect, test } from 'bun:test';
import { VERSION } from './index';

test('exposes its version', () => {
	expect(VERSION).toBe('0.0.0');
});
