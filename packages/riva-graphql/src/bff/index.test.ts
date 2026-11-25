import { expect, expectTypeOf, test } from 'bun:test';
import { RivaRequestError } from '@softistx/riva';
import { parse } from 'graphql';
import { operationOf } from '../operation';
import type { GraphQLTransport } from '../transport';
import { type BffTransportOptions, bffTransport } from './index';

const op = operationOf(
	parse('query Patients($at: String) { patients(at: $at) { id } }') as never,
);

test('posts the operation id and the encoded variables, and decodes the data', async () => {
	const seen: Array<{ url: string; body: unknown }> = [];
	const t = bffTransport({
		fetch: (async (url: string, init: RequestInit) => {
			seen.push({ url, body: JSON.parse(init.body as string) });
			return Response.json({
				data: { at: { $t: 'D', v: '1970-01-01T00:00:00.000Z' } },
			});
		}) as never,
	});
	const data = (await t.execute(op, { at: new Date(0) } as never, {
		signal: new AbortController().signal,
	})) as { at: Date };
	expect(data.at).toBeInstanceOf(Date);
	expect(seen[0]?.url).toBe('/_data');
	expect(seen[0]?.body).toEqual({
		id: 'Patients',
		variables: { at: { $t: 'D', v: '1970-01-01T00:00:00.000Z' } },
	});
});

test("the route's error becomes a RivaRequestError", async () => {
	const t = bffTransport({
		fetch: (async () =>
			Response.json(
				{ error: { code: 'LOCKED', message: 'Locked.', status: 409 } },
				{ status: 409 },
			)) as never,
	});
	const e = await t
		.execute(op, {} as never, { signal: new AbortController().signal })
		.catch((x: unknown) => x);
	expect(e).toBeInstanceOf(RivaRequestError);
	expect((e as RivaRequestError).code).toBe('LOCKED');
});

test('types: a GraphQLTransport taking the shared options', () => {
	expectTypeOf(bffTransport).returns.toEqualTypeOf<GraphQLTransport>();
	expectTypeOf<Parameters<typeof bffTransport>[0]>().toEqualTypeOf<
		BffTransportOptions | undefined
	>();
});
