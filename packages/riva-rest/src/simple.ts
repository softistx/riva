import type { OperationsShape } from '@softistx/openapi-httpyz';
import {
	type CachePolicy,
	type Query,
	type Riva,
	RivaError,
	type RivaExtension,
} from '@softistx/riva';
import type { MutationHandle, Resource } from '@softistx/riva/resource';
import { callsOf, type GetCall, type MutateCall } from './calls';
import {
	fetchTransport,
	type RestBaseOptions,
	type RestInput,
} from './fetch-transport';
import { apiTransport } from './http-transport';
import { operationOf } from './operation';
import type { InputArg } from './resources';
import { provideRest, type RestTransport } from './transport';
import type { ClientOf, DataOf, DecodedOf, InputOf, RouteOf } from './types';
import { SAFE } from './wire';

export type { GetCall, MutateCall } from './calls';
export type { RestBaseOptions, RestInput } from './fetch-transport';

/** The methods a mutation takes. */
export type MutationMethod = 'post' | 'put' | 'patch' | 'delete';

/** Every path the spec has an operation of `Method` for, as the spec writes it. */
export type PathsOf<Ops extends OperationsShape<Ops>, Method extends string> =
	RouteOf<Ops> extends infer R
		? R extends `${Method} ${infer P}`
			? P
			: never
		: never;

type Route<Ops extends OperationsShape<Ops>, M extends string, P> = Extract<
	`${M} ${P & string}`,
	RouteOf<Ops>
>;

/** What `createRiva({ rest: rest(api) })` puts on `riva.rest`, typed by the spec's operations. */
export interface RestApi<
	Ops extends OperationsShape<Ops>,
	Decoded extends boolean = true,
> {
	/**
	 * A reactive resource over a GET: `state`, `subscribe`, and awaitable
	 * (`await riva.rest.get('/invoices/{id}', { param: { id } })` gives the data
	 * or throws). The input is httpyz's `{ param, query, json }`: a plain value,
	 * a riva signal or computed, or a function that reads signals. The key is the
	 * method, the path and the input. Lazy: it fetches at its first subscriber or
	 * observed reader; `await` is a one-shot load.
	 */
	get<P extends PathsOf<Ops, 'get'>>(
		path: P,
		...args: RestArgs<InputOf<Ops, Route<Ops, 'get', P>>, GetCall>
	): Resource<DataOf<Ops, Route<Ops, 'get', P>, Decoded>>;
	/**
	 * The same over a query definition (from `query(api, route)`): it is used as
	 * is, so a loader's `ensure(riva, def, input)` and this call share one cache entry.
	 */
	get<I, Data>(
		definition: Query<I, Data>,
		...args: RestArgs<I, GetCall>
	): Resource<Data>;
	/** A callable handle over a mutation: `await save(input, { invalidates })`, a reactive `state` (idle first) and `reset()`. */
	mutation<M extends MutationMethod, P extends PathsOf<Ops, M>>(
		method: M,
		path: P,
	): MutationHandle<
		InputOf<Ops, Route<Ops, M, P>>,
		DataOf<Ops, Route<Ops, M, P>, Decoded>,
		MutateCall
	>;
	/** Runs the call and resolves with its data; throws after the transport's error. `invalidates` is marked stale once it succeeded. */
	post<P extends PathsOf<Ops, 'post'>>(
		path: P,
		...args: OneShot<InputOf<Ops, Route<Ops, 'post', P>>>
	): Promise<DataOf<Ops, Route<Ops, 'post', P>, Decoded>>;
	/** As `post`, for a PUT. */
	put<P extends PathsOf<Ops, 'put'>>(
		path: P,
		...args: OneShot<InputOf<Ops, Route<Ops, 'put', P>>>
	): Promise<DataOf<Ops, Route<Ops, 'put', P>, Decoded>>;
	/** As `post`, for a PATCH. */
	patch<P extends PathsOf<Ops, 'patch'>>(
		path: P,
		...args: OneShot<InputOf<Ops, Route<Ops, 'patch', P>>>
	): Promise<DataOf<Ops, Route<Ops, 'patch', P>, Decoded>>;
	/** As `post`, for a DELETE. */
	delete<P extends PathsOf<Ops, 'delete'>>(
		path: P,
		...args: OneShot<InputOf<Ops, Route<Ops, 'delete', P>>>
	): Promise<DataOf<Ops, Route<Ops, 'delete', P>, Decoded>>;
}

/** What `createRiva({ rest: rest({ baseUrl }) })` puts on `riva.rest`: no spec, so the data type is yours. */
export interface UntypedRestApi {
	/** As the typed `get`, over a URL path (`'/invoices/42'`, or `'/invoices/{id}'` with `param`); `Data` is what you expect back. */
	get<Data = unknown>(
		path: string,
		input?: InputArg<RestInput>,
		call?: GetCall,
	): Resource<Data>;
	/** The same over a query definition, used as is (it shares its cache entries with `ensure`). */
	get<Data, Input = RestInput>(
		definition: Query<Input, Data>,
		input?: InputArg<Input>,
		call?: GetCall,
	): Resource<Data>;
	mutation<Data = unknown, Input = RestInput>(
		method: MutationMethod,
		path: string,
	): MutationHandle<Input, Data, MutateCall>;
	post<Data = unknown>(
		path: string,
		input?: RestInput,
		call?: MutateCall,
	): Promise<Data>;
	put<Data = unknown>(
		path: string,
		input?: RestInput,
		call?: MutateCall,
	): Promise<Data>;
	patch<Data = unknown>(
		path: string,
		input?: RestInput,
		call?: MutateCall,
	): Promise<Data>;
	delete<Data = unknown>(
		path: string,
		input?: RestInput,
		call?: MutateCall,
	): Promise<Data>;
}

// The input is optional when the operation takes none, or only optional parts.
// biome-ignore lint/suspicious/noConfusingVoidType: no input is `void`
type Optional<I> = [I] extends [void | undefined] ? true : false;
type RestArgs<I, Call> =
	Optional<I> extends true
		? [input?: InputArg<NonNullable<I>>, call?: Call]
		: [input: InputArg<I>, call?: Call];
type OneShot<I> =
	Optional<I> extends true
		? [input?: NonNullable<I>, call?: MutateCall]
		: [input: I, call?: MutateCall];

export interface RestSimpleOptions {
	/** Stores the data of every call; default as is. */
	cache?: CachePolicy;
}

const isBase = (x: unknown): x is RestBaseOptions =>
	typeof (x as RestBaseOptions)?.baseUrl === 'string';

/**
 * The REST extension of `createRiva`: `createRiva({ rest: rest(api) })`, with
 * `api` from `createOpenApiClient`, gives `riva.rest.get / mutation / post /
 * put / patch / delete` typed by the spec's operations;
 * `rest({ baseUrl })` gives the untyped ones over `fetch`. Definitions made with `query()` and
 * `mutation()` keep working on the same riva.
 */
export function rest<
	Ops extends OperationsShape<Ops>,
	Api extends ClientOf<Ops, boolean>,
>(
	api: Api & ClientOf<Ops, boolean>,
	options?: RestSimpleOptions,
): RivaExtension<RestApi<Ops, DecodedOf<Ops, Api>>>;
export function rest(
	options: RestBaseOptions & RestSimpleOptions,
): RivaExtension<UntypedRestApi>;
export function rest(
	source: unknown,
	options: RestSimpleOptions = {},
): RivaExtension<unknown> {
	const base = isBase(source);
	const transport: RestTransport = base
		? fetchTransport(source)
		: apiTransport(source as never);
	const cache = (base ? (source as RestSimpleOptions) : options).cache;
	return {
		install(riva: Riva) {
			provideRest(riva, transport);
			const calls = callsOf(
				riva,
				(method, path, kind) => {
					if (base) {
						if (SAFE.has(method) !== (kind === 'query'))
							throw new RivaError(
								'RIVA_DEFINITION',
								`riva-rest: ${method.toUpperCase()} ${path} is not a mutation; riva.rest.mutation takes post, put, patch or delete.`,
							);
						return {
							id: `${method} ${path}`,
							method,
							path,
							operationId: '',
							hasInput: true,
						};
					}
					return operationOf(
						source as never,
						`${method} ${path}` as never,
						kind,
					);
				},
				cache,
			);
			const one =
				(method: MutationMethod) =>
				(path: string, input?: unknown, call?: MutateCall) =>
					calls.mutate(method, path, input, call);
			return {
				get: calls.get,
				mutation: calls.mutation,
				post: one('post'),
				put: one('put'),
				patch: one('patch'),
				delete: one('delete'),
			};
		},
	};
}
