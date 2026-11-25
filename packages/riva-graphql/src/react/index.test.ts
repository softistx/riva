import { expect, test } from 'bun:test';
import * as react from './index';

test('the subpath exports the three hooks', () => {
	expect(Object.keys(react).sort()).toEqual([
		'useGraphQL',
		'useGraphQLMutation',
		'useGraphQLSubscription',
	]);
});
