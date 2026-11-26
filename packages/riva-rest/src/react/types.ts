import type { OperationsShape } from '@softistx/openapi-httpyz';
import type { Query } from '@softistx/riva';
import type { ResourceState } from '@softistx/riva/resource';
import type {
	MutationHook,
	SuspendedState,
} from '@softistx/riva-react/resource';
import type { GetCall, MutateCall } from '../calls';
import type { InputArg } from '../resources';
import type { MutationMethod, PathsOf } from '../simple';
import type { DataOf, InputOf, RouteOf } from '../types';

/**
 * Types the hooks by your spec: augment it once, with the operations table
 * the client was made with (and `decoded: false` for a client with
 * `decode: false`).
 *
 * ```ts
 * declare module '@softistx/riva-rest/react' {
 *   interface Register { operations: Operations }
 * }
 * ```
 *
 * Without it the hooks are untyped (`useRest<Data>(...)`).
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled by module augmentation
export interface Register {}

/** Options of `useRest`: `riva.rest.get`'s, plus `suspense`. */
export interface UseRestOptions extends Omit<GetCall, 'signal'> {
	/** Suspends until there is data, and throws an error to the nearest error boundary. The state is then `success`. Default false. */
	suspense?: boolean;
}

/** `enabled` is not available with `suspense`: a hook that suspends has data or throws, it is never idle. */
type Suspending<O> = Omit<O, 'enabled'> & { suspense: true; enabled?: never };

type Route<Ops extends OperationsShape<Ops>, M extends string, P> = Extract<
	`${M} ${P & string}`,
	RouteOf<Ops>
>;

// biome-ignore lint/suspicious/noConfusingVoidType: no input is `void`
type Optional<I> = [I] extends [void | undefined] ? true : false;
type Args<I, O> =
	Optional<I> extends true
		? [input?: InputArg<NonNullable<I>>, options?: O]
		: [input: InputArg<I>, options?: O];
type SuspenseArgs<I, O> =
	Optional<I> extends true
		? [input: InputArg<NonNullable<I>> | undefined, options: O]
		: [input: InputArg<I>, options: O];

/** `useRest` over the registered spec. */
export interface TypedUseRest<
	Ops extends OperationsShape<Ops>,
	Decoded extends boolean,
> {
	<P extends PathsOf<Ops, 'get'>>(
		method: 'get',
		path: P,
		...args: SuspenseArgs<
			InputOf<Ops, Route<Ops, 'get', P>>,
			Suspending<UseRestOptions>
		>
	): SuspendedState<DataOf<Ops, Route<Ops, 'get', P>, Decoded>>;
	<P extends PathsOf<Ops, 'get'>>(
		method: 'get',
		path: P,
		...args: Args<
			InputOf<Ops, Route<Ops, 'get', P>>,
			UseRestOptions & { suspense?: false }
		>
	): ResourceState<DataOf<Ops, Route<Ops, 'get', P>, Decoded>>;
	<I, Data>(
		definition: Query<I, Data>,
		...args: SuspenseArgs<I, Suspending<UseRestOptions>>
	): SuspendedState<Data>;
	<I, Data>(
		definition: Query<I, Data>,
		...args: Args<I, UseRestOptions & { suspense?: false }>
	): ResourceState<Data>;
}

/** `useRestMutation` over the registered spec. */
export type TypedUseRestMutation<
	Ops extends OperationsShape<Ops>,
	Decoded extends boolean,
> = <M extends MutationMethod, P extends PathsOf<Ops, M>>(
	method: M,
	path: P,
) => MutationHook<
	InputOf<Ops, Route<Ops, M, P>>,
	DataOf<Ops, Route<Ops, M, P>, Decoded>,
	MutateCall
>;

/** `useRest` with no spec: `Data` is what you expect back. */
export interface UntypedUseRest {
	<Data = unknown>(
		method: 'get',
		path: string,
		input: unknown,
		options: Suspending<UseRestOptions>,
	): SuspendedState<Data>;
	<Data = unknown>(
		method: 'get',
		path: string,
		input?: unknown,
		options?: UseRestOptions & { suspense?: false },
	): ResourceState<Data>;
	<Data, Input = unknown>(
		definition: Query<Input, Data>,
		input: InputArg<Input> | undefined,
		options: Suspending<UseRestOptions>,
	): SuspendedState<Data>;
	<Data, Input = unknown>(
		definition: Query<Input, Data>,
		...args: Args<Input, UseRestOptions & { suspense?: false }>
	): ResourceState<Data>;
}

/** `useRestMutation` with no spec. */
export type UntypedUseRestMutation = <Data = unknown, Input = unknown>(
	method: MutationMethod,
	path: string,
) => MutationHook<Input, Data, MutateCall>;

type Ops = Register extends { operations: infer O extends OperationsShape<O> }
	? O
	: never;
type Decoded = Register extends { decoded: false } ? false : true;

/** The type of `useRest`: typed once `Register` names the spec. */
export type UseRest = [Ops] extends [never]
	? UntypedUseRest
	: TypedUseRest<Ops, Decoded>;
/** The type of `useRestMutation`. */
export type UseRestMutation = [Ops] extends [never]
	? UntypedUseRestMutation
	: TypedUseRestMutation<Ops, Decoded>;
