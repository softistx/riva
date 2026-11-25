import { expect, test } from 'bun:test';
import { createRivaClient, RivaScopeError } from '@softistx/riva';
import { RouterContextProvider } from 'react-router';
import { riva, rivaContext, rivaOf } from './context';

test('rivaOf reads the request client from the context', () => {
	const context = new RouterContextProvider();
	const client = createRivaClient();
	context.set(rivaContext, client);
	expect(rivaOf(context)).toBe(client);
});

test('rivaOf without the middleware throws a RivaScopeError naming the fix', () => {
	const context = new RouterContextProvider();
	let e: RivaScopeError | undefined;
	try {
		rivaOf(context);
	} catch (error) {
		e = error as RivaScopeError;
	}
	expect(e).toBeInstanceOf(RivaScopeError);
	expect(e?.code).toBe('RIVA_SCOPE');
	expect(e?.message).toBe(
		"No RivaClient in this request: add rivaMiddleware() from @softistx/riva-react-router/server to the root route's middleware.",
	);
});

test('riva() makes a spreadable payload holding a snapshot of the request client', () => {
	const context = new RouterContextProvider();
	context.set(rivaContext, createRivaClient());
	const data = { ...riva(context), extra: 1 };
	expect(Object.keys(data)).toEqual(['~riva', 'extra']);
	expect(data['~riva']).toMatchObject({ v: 1, q: [], a: {} });
	expect(JSON.parse(JSON.stringify(data))['~riva'].v).toBe(1);
});
