import { RivaRequestError } from '../errors';

/** One entry of a response's `errors`. */
export interface GraphQLErrorEntry {
	readonly message: string;
	/** Where in the result the error happened: `['viewer', 'friends', 0, 'name']`. */
	readonly path?: readonly (string | number)[];
	/** The API's `extensions.code`. */
	readonly code?: string;
}

const describe = (e: GraphQLErrorEntry): string =>
	e.path?.length ? `${e.message} (at ${e.path.join('.')})` : e.message;

/**
 * A GraphQL response carried `errors`. `errors` lists them all with their
 * paths, `data` is what the API resolved despite them (a partial result), and
 * `cause` is the client's error. A `RivaRequestError`, so `instanceof` and the
 * retry policy hold. Thrown by `@softistx/riva-graphql`.
 */
export class GraphQLError extends RivaRequestError {
	readonly errors: readonly GraphQLErrorEntry[];
	readonly data: unknown;
	constructor(
		code: string,
		errors: readonly GraphQLErrorEntry[],
		data: unknown,
		options: { retryable: boolean; status?: number; cause?: unknown },
	) {
		super(code, errors.map(describe).join('; '), options);
		this.name = 'GraphQLError';
		this.errors = errors;
		this.data = data;
	}
}
