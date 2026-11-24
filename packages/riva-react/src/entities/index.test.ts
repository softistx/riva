import { expect, test } from 'bun:test';
import * as api from './index';

test('the subpath exports useFragment and nothing else at runtime', () => {
	expect(Object.keys(api)).toEqual(['useFragment']);
});
