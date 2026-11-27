import type { GraphQLClient } from '@softistx/graphql-client';
import { toRivaError } from './errors';
import { isIncremental } from './incremental';
import type { GraphQLTransport } from './transport';

const noop = () => {};

/**
 * The transport over an `@softistx/graphql-client` client: a query goes
 * through `client.query`, a mutation through `client.mutate`, with the
 * definition's signal. The client's own `persisted` option decides whether the
 * persisted id or the text is sent. A subscription goes through
 * `client.subscribe`. A query selecting `@defer` or `@stream` is iterated:
 * each state before the last goes to `onPart`, and the final data is what
 * `execute` resolves with. Its errors are mapped by `toRivaError`.
 */
export function graphqlClientTransport(
	client: GraphQLClient,
): GraphQLTransport {
	return {
		subscribe: (operation, variables, { signal }) =>
			client.subscribe(operation.document, variables as never, {
				signal,
			}) as AsyncIterable<never>,
		async execute(operation, variables, { signal, onPart }) {
			const call = [operation.document, variables, { signal }] as never as [
				never,
				never,
				{ signal: AbortSignal },
			];
			try {
				if (onPart && operation.kind === 'query' && isIncremental(operation)) {
					const stream = client.query(...call);
					// One request: awaiting the call below rejects as a plain query does.
					stream.catch(noop);
					for await (const state of stream)
						if (state.dataState === 'streaming') onPart(state.data as never);
					return (await stream) as never;
				}
				return (await (operation.kind === 'mutation'
					? client.mutate(...call)
					: client.query(...call))) as never;
			} catch (error) {
				throw toRivaError(error, signal);
			}
		},
	};
}
