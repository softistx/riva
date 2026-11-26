import { expect, test } from 'bun:test';
import { createRiva } from '@softistx/riva';
import { apiOver, httpWith, json } from '../../test/fixtures';
import { withRest } from '../simple';
import { restOf } from './rest-of';

test('returns riva.rest, or a RIVA_DEFINITION error that says how to install it', () => {
	const riva = createRiva({
		rest: withRest(apiOver(httpWith(async () => json({})))),
	});
	expect(restOf(riva)).toBe(riva.rest as never);
	expect(() => restOf(createRiva())).toThrow(
		'createRiva({ rest: withRest(api) })',
	);
});
