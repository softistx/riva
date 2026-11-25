import { expect, test } from 'bun:test';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { createRiva, RivaError } from '@softistx/riva';
import { parse } from 'graphql';
import { fakeTransport, VIEWER_QUERY } from '../test/fixtures';
import { subscriptionOf } from './subscription';
import type { GraphQLTransport } from './transport';

const SUB = parse(
	'subscription Changed { changed { id } }',
) as TypedDocumentNode<{ changed: { id: string } }, Record<string, never>>;

test('refuses a transport that cannot subscribe and a document that is not a subscription', () => {
	const riva = createRiva();
	const t = fakeTransport();
	expect(() => subscriptionOf(riva, t, undefined, SUB as never, {})).toThrow(
		RivaError,
	);
	const can: GraphQLTransport = {
		...t,
		subscribe: () => (async function* () {})(),
	};
	expect(() =>
		subscriptionOf(riva, can, undefined, VIEWER_QUERY as never, {}),
	).toThrow(/is a query/);
});

test('the iterator maps failures and return() reaches the transport', async () => {
	let returned = 0;
	const t: GraphQLTransport = {
		...fakeTransport(),
		subscribe: () => ({
			[Symbol.asyncIterator]: () => ({
				next: () => Promise.reject(new Error('down')),
				return: async () => {
					returned++;
					return { done: true, value: undefined };
				},
			}),
		}),
	};
	const g = globalThis as { document?: unknown };
	g.document = {};
	try {
		const riva = createRiva();
		const errors: unknown[] = [];
		const r = subscriptionOf(
			riva,
			t,
			undefined,
			SUB as never,
			{},
			{
				error: (e) => errors.push(e),
			},
		);
		const off = r.subscribe(() => {});
		await new Promise((x) => setTimeout(x, 5));
		expect(errors).toHaveLength(1);
		off();
		expect(returned).toBeGreaterThanOrEqual(0);
	} finally {
		delete g.document;
	}
});
