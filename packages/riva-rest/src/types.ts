import type {
	ClientMembers,
	OperationReply,
	OperationsShape,
	OperationTable,
	RoutesOf,
} from '@softistx/openapi-httpyz';

/** What a route is read against at runtime: the client's operation table (`api.operations`). */
export interface SpecOf<Ops extends OperationsShape<Ops>> {
	readonly operations: OperationTable<Ops>;
}

/**
 * Whether the client decodes its replies (`decode: true`, the default): read
 * off its `op`, since a type parameter cannot be inferred through the
 * conditional that picks the decoded or the JSON reply. A client whose two
 * replies agree is read as decoded, which changes nothing.
 */
export type DecodedOf<
	Ops extends OperationsShape<Ops>,
	Api extends ClientOf<Ops, boolean>,
> = [ReturnType<Api['op']>] extends [ReturnType<ClientOf<Ops, true>['op']>]
	? true
	: false;

/**
 * What the definitions take of an OpenAPI client (`createOpenApiClient(...)`):
 * its operations, and through `op` whether it decodes its replies, which
 * types the data.
 */
export type ClientOf<
	Ops extends OperationsShape<Ops>,
	Decoded extends boolean = true,
> = Pick<ClientMembers<Ops, RoutesOf<Ops>, Decoded>, 'operations' | 'op'>;

/** Every `'method /path/{param}'` the spec has an operation for. */
export type RouteOf<Ops extends OperationsShape<Ops>> = keyof RoutesOf<Ops> &
	string;

/** The routes `query()` accepts: not a `put`, `patch` or `delete`. */
export type QueryRoute<Ops extends OperationsShape<Ops>> = Exclude<
	RouteOf<Ops>,
	`${'put' | 'patch' | 'delete'} ${string}`
>;

/** The routes `mutation()` accepts: not a `get`, `head` or `options`. */
export type MutationRoute<Ops extends OperationsShape<Ops>> = Exclude<
	RouteOf<Ops>,
	`${'get' | 'head' | 'options'} ${string}`
>;

type KeyOf<
	Ops extends OperationsShape<Ops>,
	R extends RouteOf<Ops>,
> = RoutesOf<Ops>[R] & keyof Ops;

/**
 * The variables of an operation: its input (`param`, `query`, `json`, …) as
 * the spec types it, `void` for an operation that takes none, and optional
 * when the spec requires nothing in it.
 */
export type InputOf<
	Ops extends OperationsShape<Ops>,
	R extends RouteOf<Ops>,
> = Ops[KeyOf<Ops, R>]['args'] extends infer A
	? A extends readonly []
		? // biome-ignore lint/suspicious/noConfusingVoidType: no input is `void`, as for a core query
			void
		: A extends readonly [infer I]
			? I
			: A extends readonly [(infer I)?]
				? I | undefined
				: never
	: never;

/**
 * The data of the operation's success replies (2xx), as the client returns
 * it: decoded (`decode: true`, the default) or as JSON carries it.
 */
export type DataOf<
	Ops extends OperationsShape<Ops>,
	R extends RouteOf<Ops>,
	Decoded extends boolean = true,
> = Success<OperationReply<Ops, KeyOf<Ops, R>, Decoded>>;

type Success<Reply> = Reply extends {
	status: infer S extends number;
	data: infer D;
}
	? `${S}` extends `2${string}`
		? D
		: never
	: never;
