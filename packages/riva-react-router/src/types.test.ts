import { expectTypeOf, test } from 'bun:test';
import {
	createRivaClient,
	type Query,
	query,
	type RivaClient,
} from '@softistx/riva';
import { buildAllowlist } from '@softistx/riva-graphql/codegen';
import { allowlist } from '@softistx/riva-graphql/server';
import type { hydrate, Snapshot } from '@softistx/riva/ssr';
import {
	type MiddlewareFunction,
	RouterContextProvider,
	type useLoaderData,
} from 'react-router';
import {
	riva,
	rivaContext,
	rivaOf,
	revalidate,
	useActionResult,
} from './index';
import { type DataSource, dataRoute, rivaMiddleware } from './server/index';

const context = new RouterContextProvider();
context.set(rivaContext, createRivaClient());

test('rivaOf returns the request client', () => {
	expectTypeOf(rivaOf(context)).toEqualTypeOf<RivaClient>();
});

test('riva() spreads into loader data, keeping the branded snapshot', () => {
	const data = { ...riva(context), user: 'u' };
	expectTypeOf(data['~riva']).toEqualTypeOf<Snapshot>();
	expectTypeOf(data.user).toEqualTypeOf<string>();
});

test('the middleware fits a route middleware list, with either result type', () => {
	expectTypeOf(rivaMiddleware()).toExtend<MiddlewareFunction<unknown>>();
	expectTypeOf(rivaMiddleware<Response>()).toExtend<
		MiddlewareFunction<Response>
	>();
	const list: MiddlewareFunction<Response>[] = [rivaMiddleware()];
	void list;
});

test('a loader payload read back through useLoaderData still feeds hydrate', () => {
	const loader = async ({
		context: c,
	}: {
		context: Readonly<RouterContextProvider>;
	}) => ({
		...riva(c),
		user: 'u',
	});
	type Data = ReturnType<typeof useLoaderData<typeof loader>>;
	expectTypeOf<Data>().not.toBeAny();
	expectTypeOf<Data['user']>().toEqualTypeOf<string>();
	expectTypeOf<Data['~riva']>().toExtend<Parameters<typeof hydrate>[1]>();
});

test('useActionResult needs select only when the result is not the data', () => {
	// Type tests only: the hooks never run here.
	const types = () => {
		const q = query<{ id: string }, { rev: number; label: string }>({
			id: 'q',
			fetch: async () => ({ rev: 1, label: 'x' }),
		});
		const vars = { id: 'a' };
		const data = { rev: 1, label: 'x' };
		const other = { label: 'x' } as { label: string } | { error: string };
		// The result is the data: select is optional.
		useActionResult(data, { into: q, vars });
		// Another shape: select is required and typed from the result.
		// @ts-expect-error select is missing
		useActionResult(other, { into: q, vars });
		useActionResult(other, {
			into: q,
			vars,
			select: (r) => {
				expectTypeOf(r).toEqualTypeOf<typeof other>();
				return 'label' in r ? { rev: 2, label: r.label } : undefined;
			},
		});
		// A select that returns the wrong data is refused.
		// @ts-expect-error not the query's data
		useActionResult(other, { into: q, vars, select: () => 'nope' });
	};
	void types;
});

test('revalidate is a query of void variables counting runs', () => {
	expectTypeOf(revalidate).toEqualTypeOf<Query<void, number>>();
});

test('the manifest allowlist and a custom source fit dataRoute', () => {
	expectTypeOf(allowlist(buildAllowlist({}))).toExtend<DataSource>();
	const route = dataRoute({ sources: [allowlist(buildAllowlist({}))] });
	expectTypeOf(route.loader).returns.toEqualTypeOf<Response>();
	expectTypeOf(route.action).returns.toEqualTypeOf<Promise<Response>>();
});
