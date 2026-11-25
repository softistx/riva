import { expect, test } from 'bun:test';
import { PREFIX, SAFE } from './wire';

test('the reading methods are get, head and options', () => {
	expect([...SAFE].sort()).toEqual(['get', 'head', 'options']);
	expect(SAFE.has('post')).toBe(false);
});

test('an operation id is its operationId under the rest: prefix', () => {
	expect(PREFIX).toBe('rest:');
});
