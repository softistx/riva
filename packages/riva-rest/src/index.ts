import { mutation, query } from './query';
import { rest as restExtension } from './simple';

export { toRivaError } from './errors';
export type { RestBaseOptions, RestInput } from './fetch-transport';
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
export type { InputArg } from './resources';
export type {
	GetCall,
	MutateCall,
	MutationMethod,
	PathsOf,
	RestApi,
	RestSimpleOptions,
	UntypedRestApi,
} from './simple';
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

/**
 * `createRiva({ rest: rest(api) })` installs `riva.rest` (see the simple API
 * guide); `rest.query(api, 'get /invoices/{id}')` and `rest.mutation` stay
 * beside the named exports.
 */
export const rest = Object.assign(restExtension, { query, mutation });
