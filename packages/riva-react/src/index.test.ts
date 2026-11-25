import { expect, test } from 'bun:test';
import * as api from './index';

test('the main entry exports the provider and the hooks, nothing from the opt-in subpaths', () => {
	expect(Object.keys(api).sort()).toEqual([
		'RivaProvider',
		'useMutation',
		'useQuery',
		'useRiva',
		'useSignal',
		'useValue',
	]);
});
