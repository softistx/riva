import { expect, test } from 'bun:test';
import { createRiva } from '@softistx/riva';
import { fakeTransport } from '../../test/fixtures';
import { withGraphQL } from '../simple';
import { graphqlOf } from './graphql-of';

test('returns riva.graphql, or a RIVA_DEFINITION error that says how to install it', () => {
	const riva = createRiva({ graphql: withGraphQL(fakeTransport()) });
	expect(graphqlOf(riva)).toBe(riva.graphql);
	expect(() => graphqlOf(createRiva())).toThrow(
		'createRiva({ graphql: withGraphQL(client) })',
	);
});
