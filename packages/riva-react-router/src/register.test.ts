import { expectTypeOf, test } from 'bun:test';
import { createRiva, type Riva } from '@softistx/riva';
import { graphql } from '@softistx/riva-graphql';
import { rest } from '@softistx/riva-rest';
import { RouterContextProvider } from 'react-router';
import {
	type RegisteredRiva,
	type RivaFrom,
	rivaContext,
	rivaOf,
} from './index';

const createAppRiva = () =>
	createRiva({
		graphql: graphql({ request: async () => ({ data: {} }) } as never),
		rest: rest({ baseUrl: 'https://api.example.com' }),
	});
type AppRiva = ReturnType<typeof createAppRiva>;

// What an app writes once. It applies to this whole package's typecheck,
// which is why the other specs compare with `RegisteredRiva`, not `Riva`.
declare module './index' {
	interface Register {
		riva: AppRiva;
	}
}

test('unregistered, the riva of a register is the base Riva', () => {
	expectTypeOf<RivaFrom<object>>().toEqualTypeOf<Riva>();
});

test('registered, rivaOf is typed by the app riva', () => {
	const context = new RouterContextProvider();
	context.set(rivaContext, createAppRiva());
	const riva = rivaOf(context);
	expectTypeOf(riva).toEqualTypeOf<AppRiva>();
	expectTypeOf<RegisteredRiva>().toEqualTypeOf<AppRiva>();
	expectTypeOf(riva.graphql.query).toBeFunction();
	expectTypeOf(riva.rest.get).toBeFunction();
	expectTypeOf<RivaFrom<{ riva: AppRiva }>>().toEqualTypeOf<AppRiva>();
});
