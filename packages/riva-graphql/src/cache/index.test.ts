import { expect, test } from 'bun:test';
import * as cache from './index';

test('the entry point exports the normalized cache and nothing else at run time', () => {
	expect(Object.keys(cache).sort()).toEqual(['normalized']);
});
