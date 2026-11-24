import type { GraphQLClient } from '@softistx/graphql-client';
import { toRivaError } from './errors';
import type { GraphQLTransport } from './transport';

/**
 * The transport over an `@softistx/graphql-client` client: a query goes
 * through `client.query`, a mutation through `client.mutate`, with the
 * definition's signal. The client's own `persisted` option decides whether the
 * persisted id or the text is sent. Its errors are mapped by `toRivaError`.
 */
export function graphqlClientTransport(
	client: GraphQLClient,
): GraphQLTransport {
	return {
		async execute(operation, variables, { signal }) {
			const call = [operation.document, variables, { signal }] as never as [
				never,
				never,
				{ signal: AbortSignal },
			];
			try {
				return (await (operation.kind === 'mutation'
					? client.mutate(...call)
					: client.query(...call))) as never;
			} catch (error) {
				throw toRivaError(error, signal);
			}
		},
	};
}
