export const VERSION = '0.0.0';

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
export type { DataOf, InputOf, RouteOf, SpecOf } from './types';
