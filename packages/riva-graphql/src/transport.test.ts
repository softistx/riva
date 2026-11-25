import { expect, test } from 'bun:test';
import { createRiva, RivaScopeError } from '@softistx/riva';
import { fakeTransport } from '../test/fixtures';
import { provideGraphQL, transportOf } from './transport';

test('a riva holds the transport it was given', () => {
	const riva = createRiva();
	const t = fakeTransport();
	provideGraphQL(riva, t);
	expect(transportOf(riva)).toBe(t);
});

test('each riva has its own transport', () => {
	const a = createRiva();
	const b = createRiva();
	provideGraphQL(a, fakeTransport());
	expect(() => transportOf(b)).toThrow(RivaScopeError);
});

test('a riva with none throws a scope error naming provideGraphQL', () => {
	let error: unknown;
	try {
		transportOf(createRiva());
	} catch (e) {
		error = e;
	}
	expect(error).toBeInstanceOf(RivaScopeError);
	expect((error as RivaScopeError).code).toBe('RIVA_SCOPE');
	expect((error as RivaScopeError).message).toContain('provideGraphQL(riva');
});
