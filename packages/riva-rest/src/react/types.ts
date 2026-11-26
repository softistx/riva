import type { OperationsShape } from '@softistx/openapi-httpyz';
import type { Query } from '@softistx/riva';
import type { ResourceState, TrackedInput } from '@softistx/riva/resource';
import type {
	MutationResult,
	SuspendedState,
} from '@softistx/riva-react/resource';
import type { RestMutateCall, RestQueryCall } from '../calls';
import type {
	GetData,
	GetInput,
	MutationMethod,
	PathsOf,
	RestInput,
	Route,
	UntypedData,
	UntypedInput,
} from '../simple';
import type { DataOf, InputOf } from '../types';

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
export interface UseRestOptions extends Omit<RestQueryCall, 'signal'> {
	/** Suspends until there is data, and throws an error to the nearest error boundary. The state is then `success`. Default false. */
	suspense?: boolean;
}

/** `enabled` is not available with `suspense`: a hook that suspends has data or throws, it is never idle. */
type Suspending<O> = Omit<O, 'enabled'> & { suspense: true; enabled?: never };

// biome-ignore lint/suspicious/noConfusingVoidType: no input is `void`
type Optional<I> = [I] extends [void | undefined] ? true : false;
type Args<I, O> =
	Optional<I> extends true
		? [input?: TrackedInput<NonNullable<I>>, options?: O]
		: [input: TrackedInput<I>, options?: O];
type SuspenseArgs<I, O> =
	Optional<I> extends true
		? [input: TrackedInput<NonNullable<I>> | undefined, options: O]
		: [input: TrackedInput<I>, options: O];

/**
 * `useRest` over the registered spec: one generic signature over the path or
 * the definition, as `riva.rest.get`. The non-suspense overload comes last,
 * because TypeScript reports the error of the last overload tried, so a wrong
 * input is named on the parameter (`'nope' does not exist`).
 */
export interface TypedUseRest<
	Ops extends OperationsShape<Ops>,
	Decoded extends boolean,
> {
	// biome-ignore lint/suspicious/noExplicitAny: matches any definition
	<T extends PathsOf<Ops, 'get'> | Query<any, any>>(
		target: T,
		...args: SuspenseArgs<GetInput<Ops, T>, Suspending<UseRestOptions>>
	): SuspendedState<GetData<Ops, T, Decoded>>;
	// biome-ignore lint/suspicious/noExplicitAny: matches any definition
	<T extends PathsOf<Ops, 'get'> | Query<any, any>>(
		target: T,
		...args: Args<GetInput<Ops, T>, UseRestOptions & { suspense?: false }>
	): ResourceState<GetData<Ops, T, Decoded>>;
}

/** `useRestMutation` over the registered spec. */
export type TypedUseRestMutation<
	Ops extends OperationsShape<Ops>,
	Decoded extends boolean,
> = <M extends MutationMethod, P extends PathsOf<Ops, M>>(
	method: M,
	path: P,
) => MutationResult<
	InputOf<Ops, Route<Ops, M, P>>,
	DataOf<Ops, Route<Ops, M, P>, Decoded>,
	RestMutateCall
>;

// A definition's input is required when it has one; a path takes any httpyz input, optionally.
type UntypedArgs<T, O> =
	// biome-ignore lint/suspicious/noExplicitAny: matches any definition
	T extends Query<infer I, any>
		? Args<I, O>
		: [input?: TrackedInput<UntypedInput<T>>, options?: O];

/** `useRest` with no spec: `Data` is what you expect back (a definition brings its own). */
export interface UntypedUseRest {
	// biome-ignore lint/suspicious/noExplicitAny: matches any definition
	<Data = unknown, T extends string | Query<any, any> = string>(
		target: T,
		input: TrackedInput<UntypedInput<T>> | undefined,
		options: Suspending<UseRestOptions>,
	): SuspendedState<UntypedData<T, Data>>;
	// biome-ignore lint/suspicious/noExplicitAny: matches any definition
	<Data = unknown, T extends string | Query<any, any> = string>(
		target: T,
		...args: UntypedArgs<T, UseRestOptions & { suspense?: false }>
	): ResourceState<UntypedData<T, Data>>;
}

/** `useRestMutation` with no spec. */
export type UntypedUseRestMutation = <Data = unknown, Input = RestInput>(
	method: MutationMethod,
	path: string,
) => MutationResult<Input, Data, RestMutateCall>;

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
