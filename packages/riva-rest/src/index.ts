export type { TrackedInput } from '@softistx/riva/resource';
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
export {
	type MutationMethod,
	type PathsOf,
	type RestApi,
	type RestMutateCall,
	type RestQueryCall,
	type RestSimpleOptions,
	type UntypedRestApi,
	withRest,
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
