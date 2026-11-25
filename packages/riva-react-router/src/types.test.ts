import { expectTypeOf, test } from 'bun:test';
import { createRivaClient, type RivaClient } from '@softistx/riva';
import type { hydrate, Snapshot } from '@softistx/riva/ssr';
import {
	type MiddlewareFunction,
	RouterContextProvider,
	type useLoaderData,
} from 'react-router';
import { riva, rivaContext, rivaOf } from './index';
import { rivaMiddleware } from './server/index';

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
