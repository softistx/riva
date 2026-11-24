export const VERSION = '0.0.0';

export { graphqlClientTransport } from './client-transport';
export { toRivaError } from './errors';
export { type Operation, type OperationKind, operationOf } from './operation';
export { persistedIdOf } from './persisted-id';
export {
	type GraphQLMutationOptions,
	type GraphQLQueryOptions,
	mutation,
	query,
} from './query';
export { type GraphQLTransport, provideGraphQL } from './transport';
export type { VarsOf } from './types';
