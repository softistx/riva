import { expect, test } from 'bun:test';
import * as entities from './index';

test('the subpath exports the policy and the entity API', () => {
	expect(Object.keys(entities).sort()).toEqual([
		'entities',
		'evict',
		'fieldsOf',
		'identifyOf',
		'invalidateEntity',
		'isPlain',
		'isRef',
		'readEntity',
		'storeOf',
		'writeEntity',
	]);
});
