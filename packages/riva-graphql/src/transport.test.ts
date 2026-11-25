import { expect, test } from 'bun:test';
import { createRivaClient, RivaScopeError } from '@softistx/riva';
import { fakeTransport } from '../test/fixtures';
import { provideGraphQL, transportOf } from './transport';

test('a client holds the transport it was given', () => {
	const client = createRivaClient();
	const t = fakeTransport();
	provideGraphQL(client, t);
	expect(transportOf(client)).toBe(t);
});

test('each client has its own transport', () => {
	const a = createRivaClient();
	const b = createRivaClient();
	provideGraphQL(a, fakeTransport());
	expect(() => transportOf(b)).toThrow(RivaScopeError);
});

test('a client with none throws a scope error naming provideGraphQL', () => {
	let error: unknown;
	try {
		transportOf(createRivaClient());
	} catch (e) {
		error = e;
	}
	expect(error).toBeInstanceOf(RivaScopeError);
	expect((error as RivaScopeError).code).toBe('RIVA_SCOPE');
	expect((error as RivaScopeError).message).toContain('provideGraphQL(client');
});
