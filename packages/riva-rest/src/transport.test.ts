import { expect, test } from 'bun:test';
import { createRiva, RivaScopeError } from '@softistx/riva';
import { fakeTransport } from '../test/fixtures';
import { provideRest, restContext, transportOf } from './transport';

test('a riva holds the transport it was given', () => {
	const riva = createRiva();
	const t = fakeTransport();
	provideRest(riva, t);
	expect(transportOf(riva)).toBe(t);
});

test('each riva has its own transport', () => {
	const a = createRiva();
	const b = createRiva();
	provideRest(a, fakeTransport());
	expect(() => transportOf(b)).toThrow(RivaScopeError);
});

test('a riva with none throws a scope error naming provideRest', () => {
	let error: unknown;
	try {
		transportOf(createRiva());
	} catch (e) {
		error = e;
	}
	expect(error).toBeInstanceOf(RivaScopeError);
	expect((error as RivaScopeError).code).toBe('RIVA_SCOPE');
	expect((error as RivaScopeError).message).toContain('provideRest(riva');
});

test('the context reads http lazily and throws when the transport has none', () => {
	const riva = createRiva();
	provideRest(riva, fakeTransport());
	const ctx = restContext({ riva, signal: new AbortController().signal });
	expect(ctx.riva).toBe(riva);
	expect(() => ctx.http).toThrow('holds no httpyz client');
});
