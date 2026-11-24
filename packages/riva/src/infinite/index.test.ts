import { expect, test } from 'bun:test';
import * as infiniteApi from './index';

test('the subpath exports infinite and nothing else at runtime', () => {
	expect(Object.keys(infiniteApi)).toEqual(['infinite']);
	expect(typeof infiniteApi.infinite).toBe('function');
});
