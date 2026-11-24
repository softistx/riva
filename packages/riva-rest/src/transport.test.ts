import { expect, test } from 'bun:test';
import { createRivaClient, RivaScopeError } from '@softistx/riva';
import { fakeTransport } from '../test/fixtures';
import { provideRest, restContext, transportOf } from './transport';

test('a client holds the transport it was given', () => {
	const client = createRivaClient();
	const t = fakeTransport();
	provideRest(client, t);
	expect(transportOf(client)).toBe(t);
});

test('each client has its own transport', () => {
	const a = createRivaClient();
	const b = createRivaClient();
	provideRest(a, fakeTransport());
	expect(() => transportOf(b)).toThrow(RivaScopeError);
});

test('a client with none throws a scope error naming provideRest', () => {
	let error: unknown;
	try {
		transportOf(createRivaClient());
	} catch (e) {
		error = e;
	}
	expect(error).toBeInstanceOf(RivaScopeError);
	expect((error as RivaScopeError).code).toBe('RIVA_SCOPE');
	expect((error as RivaScopeError).message).toContain('provideRest(client');
});

test('the context reads http lazily and throws when the transport has none', () => {
	const client = createRivaClient();
	provideRest(client, fakeTransport());
	const ctx = restContext({ client, signal: new AbortController().signal });
	expect(ctx.client).toBe(client);
	expect(() => ctx.http).toThrow('holds no httpyz client');
});
