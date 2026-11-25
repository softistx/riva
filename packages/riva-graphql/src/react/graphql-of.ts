import { type Riva, RivaError } from '@softistx/riva';
import type { GraphQLApi } from '../simple';

/** `riva.graphql` of the riva in scope, or a `RIVA_DEFINITION` error that says how to install it. */
export function graphqlOf(riva: Riva): GraphQLApi {
	const api = (riva as unknown as { graphql?: GraphQLApi }).graphql;
	if (!api)
		throw new RivaError(
			'RIVA_DEFINITION',
			'riva-graphql/react: the riva in scope has no GraphQL: create it with createRiva({ graphql: graphql(client) }).',
		);
	return api;
}
