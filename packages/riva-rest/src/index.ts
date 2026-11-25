import { mutation, query } from './query';

export { toRivaError } from './errors';
export { httpyzTransport } from './http-transport';
export { type Operation, operationOf } from './operation';
export {
	type FreeMutationOptions,
	type FreeQueryOptions,
	mutation,
	query,
	type RestMutationOptions,
	type RestQueryOptions,
} from './query';
export {
	provideRest,
	type RestContext,
	type RestTransport,
	type Route,
} from './transport';
export type {
	ClientOf,
	DataOf,
	DecodedOf,
	InputOf,
	MutationRoute,
	QueryRoute,
	RouteOf,
	SpecOf,
} from './types';

/** `rest.query(api, 'get /invoices/{id}')`, beside the named exports. */
export const rest = { query, mutation } as const;
