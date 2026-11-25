import { type RivaClient, RivaScopeError } from '@softistx/riva';
import type { Operation } from './operation';

/**
 * Runs one operation. `@softistx/riva-graphql` ships `graphqlClientTransport`;
 * any object of this shape works (a transport that posts the id and the
 * variables to a BFF route, a test double). It throws `RivaError`s.
 */
export interface GraphQLTransport {
	execute<Data, Vars>(
		operation: Operation<Data, Vars>,
		variables: Vars,
		options: { signal: AbortSignal },
	): Promise<Data>;
}

// Held on the client's slots: the transport of a request dies with its client.
const SLOT = {};

/** Gives `client` the transport its GraphQL definitions fetch through. */
export function provideGraphQL(
	client: RivaClient,
	transport: GraphQLTransport,
): void {
	client.slots.set(SLOT, transport);
}

/** The transport `provideGraphQL` gave `client`; throws `RivaScopeError` when none. */
export function transportOf(client: RivaClient): GraphQLTransport {
	const transport = client.slots.get(SLOT) as GraphQLTransport | undefined;
	if (!transport)
		throw new RivaScopeError(
			'No GraphQL transport on this RivaClient: call provideGraphQL(client, graphqlClientTransport(gqlClient)) when you create it.',
		);
	return transport;
}
