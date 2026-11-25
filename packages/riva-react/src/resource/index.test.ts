import { expect, test } from 'bun:test';
import * as resource from './index';

test('exports the hooks and helpers of the subpath', () => {
	expect(Object.keys(resource).sort()).toEqual([
		'suspenseStaleTime',
		'useCallResource',
		'useMutationHandle',
		'useResource',
		'useStableInput',
	]);
});
