import type {
	OperationsShape,
	OperationTable,
	RoutesOf,
} from '@softistx/openapi-httpyz';

/** What the definitions read of a client: its operation table (`api.operations`), for the types and the checks at definition time. */
export interface SpecOf<Ops extends OperationsShape<Ops>> {
	readonly operations: OperationTable<Ops>;
}

/** Every `'method /path/{param}'` the spec has an operation for. */
export type RouteOf<Ops extends OperationsShape<Ops>> = keyof RoutesOf<Ops> &
	string;

type OpOf<
	Ops extends OperationsShape<Ops>,
	R extends RouteOf<Ops>,
> = RoutesOf<Ops>[R] extends keyof Ops ? Ops[RoutesOf<Ops>[R]] : never;

/**
 * The variables of an operation: its input (`param`, `query`, `json`, …) as
 * the spec types it, `void` for an operation that takes none, and optional
 * when the spec requires nothing in it.
 */
export type InputOf<
	Ops extends OperationsShape<Ops>,
	R extends RouteOf<Ops>,
> = OpOf<Ops, R>['args'] extends infer A
	? A extends readonly []
		? // biome-ignore lint/suspicious/noConfusingVoidType: no input is `void`, as for a core query
			void
		: A extends readonly [infer I]
			? I
			: A extends readonly [(infer I)?]
				? I | undefined
				: never
	: never;

/** The data of the operation's success replies (2xx), as the spec types them. */
export type DataOf<
	Ops extends OperationsShape<Ops>,
	R extends RouteOf<Ops>,
> = Success<OpOf<Ops, R>['reply']>;

type Success<Reply> = Reply extends {
	status: infer S extends number;
	data: infer D;
}
	? `${S}` extends `2${string}`
		? D
		: never
	: never;
