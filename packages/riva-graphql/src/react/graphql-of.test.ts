import { expect, test } from 'bun:test';
import { createRiva } from '@softistx/riva';
import { fakeTransport } from '../../test/fixtures';
import { graphql } from '../simple';
import { graphqlOf } from './graphql-of';

test('returns riva.graphql, or a RIVA_DEFINITION error that says how to install it', () => {
	const riva = createRiva({ graphql: graphql(fakeTransport()) });
	expect(graphqlOf(riva)).toBe(riva.graphql);
	expect(() => graphqlOf(createRiva())).toThrow(
		'createRiva({ graphql: graphql(client) })',
	);
});
