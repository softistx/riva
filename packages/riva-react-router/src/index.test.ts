import { expect, test } from 'bun:test';
import * as barrel from './index';

test('the barrel exports the browser-safe surface', () => {
	expect(Object.keys(barrel).sort()).toEqual([
		'RivaRouterProvider',
		'revalidate',
		'riva',
		'rivaContext',
		'rivaOf',
		'useActionResult',
	]);
});

test('the barrel stays free of the server entry', () => {
	expect('rivaMiddleware' in barrel).toBe(false);
});
