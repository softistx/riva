import { expect, test } from 'bun:test';
import * as react from './index';

test('the subpath exports the two hooks', () => {
	expect(Object.keys(react).sort()).toEqual(['useRest', 'useRestMutation']);
});
