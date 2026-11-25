import { expect, test } from 'bun:test';
import * as barrel from './index';

test('the barrel exports the browser-safe surface and its version', () => {
	expect(barrel.VERSION).toBe('0.0.0');
	expect(Object.keys(barrel).sort()).toEqual([
		'RivaRouterProvider',
		'VERSION',
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
