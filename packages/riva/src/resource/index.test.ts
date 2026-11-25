import { expect, test } from 'bun:test';
import * as api from './index';

test('the subpath exports the resource builders and nothing else at runtime', () => {
	expect(Object.keys(api).sort()).toEqual([
		'mutationHandle',
		'resource',
		'streamResource',
	]);
});
