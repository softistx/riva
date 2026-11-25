import { type CachePolicy, type Riva, RivaError } from '@softistx/riva';
import { streamResource } from '@softistx/riva/resource';
import type { Doc } from './calls';
import { toRivaError } from './errors';
import { operationOf } from './operation';
import type { OperationCache } from './query';
import { memoFactory, varsReader } from './resources';
import type { GraphQLTransport } from './transport';

/** The options and callbacks of `riva.graphql.subscribe`, all optional. An error thrown by `next`, `error` or `complete` is raised outside the stream (never reported to `error`), and a throwing `next` ends it. */
export interface SubscribeCall<Data> {
	/** Each result, after it was merged into the cache when the cache can hold it. */
	next?(data: Data): void;
	/** A failure ends the subscription; a `RivaError` when the transport's error is known. */
	error?(error: unknown): void;
	/** The stream ended on its own (not after the last reader left, nor a failure). */
	complete?(): void;
	/** A boolean, or a function read in a tracked computed. While false the state is `idle` and nothing is opened. Default true. */
	enabled?: boolean | (() => boolean);
}

/** Opens `doc` as a lazy stream resource; throws when the transport cannot subscribe or the document is not a subscription. */
export function subscriptionOf(
	riva: Riva,
	transport: GraphQLTransport,
	cache: CachePolicy | OperationCache | undefined,
	doc: Doc<unknown, never>,
	vars: unknown,
	on: SubscribeCall<never> = {},
) {
	const op = operationOf(doc, 'subscription');
	if (!transport.subscribe)
		throw new RivaError(
			'RIVA_DEFINITION',
			'riva-graphql: this transport cannot subscribe: give graphql() a @softistx/graphql-client client, or a transport with a subscribe method.',
		);
	const read = varsReader(riva, vars as never);
	const policy =
		cache && 'forOperation' in cache ? cache.forOperation(op) : cache;
	const subscribeTo = transport.subscribe.bind(transport);
	const factoryOf = memoFactory(
		op.id,
		(vars: never) => (signal: AbortSignal) => ({
			[Symbol.asyncIterator]() {
				const it = subscribeTo(op, vars, { signal })[Symbol.asyncIterator]();
				return {
					async next() {
						try {
							const r = await it.next();
							if (!r.done) policy?.commit?.(riva, r.value, vars);
							return r;
						} catch (e) {
							throw toRivaError(e, signal);
						}
					},
					// Not a generator: return() reaches the transport even while a next() is pending.
					return: async (v?: unknown) =>
						(await it.return?.(v as never)) ?? {
							done: true as const,
							value: undefined,
						},
				};
			},
		}),
	);
	return streamResource(riva, () => factoryOf(read()), {
		...(on.enabled !== undefined && { enabled: on.enabled }),
		...(on.next && { next: on.next }),
		...(on.error && { error: on.error }),
		...(on.complete && { complete: on.complete }),
	});
}
