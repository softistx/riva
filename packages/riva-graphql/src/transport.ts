import { type Riva, RivaScopeError } from '@softistx/riva';
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
		options: {
			signal: AbortSignal;
			/**
			 * Passed to a query only. A transport that receives an operation in
			 * parts (`@defer`, `@stream`) calls it with the data so far on each
			 * part before the last, then resolves with the final data. One that
			 * ignores it just resolves: the query renders when it does.
			 */
			onPart?: (data: Data) => void;
		},
	): Promise<Data>;
	/**
	 * Optional: opens a subscription and yields each result's data until the
	 * signal aborts. Without it, `riva.graphql.subscribe` throws.
	 */
	subscribe?<Data, Vars>(
		operation: Operation<Data, Vars>,
		variables: Vars,
		options: { signal: AbortSignal },
	): AsyncIterable<Data>;
}

// Held on the riva's slots: the transport of a request dies with its riva.
const SLOT = {};

/** Gives `riva` the transport its GraphQL definitions fetch through. */
export function provideGraphQL(riva: Riva, transport: GraphQLTransport): void {
	riva.slots.set(SLOT, transport);
}

/** The transport `provideGraphQL` gave `riva`; throws `RivaScopeError` when none. */
export function transportOf(riva: Riva): GraphQLTransport {
	const transport = riva.slots.get(SLOT) as GraphQLTransport | undefined;
	if (!transport)
		throw new RivaScopeError(
			'No GraphQL transport on this Riva: call provideGraphQL(riva, graphqlClientTransport(gqlClient)) when you create it.',
		);
	return transport;
}
