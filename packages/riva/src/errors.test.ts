import { expect, test } from 'bun:test';
import { RivaError, RivaScopeError } from './errors';

test('RivaError carries a code and its name', () => {
	const e = new RivaError('X', 'boom');
	expect(e).toBeInstanceOf(Error);
	expect(e.code).toBe('X');
	expect(e.name).toBe('RivaError');
	expect(e.message).toBe('boom');
});

test('RivaScopeError is a RivaError with the scope code', () => {
	const e = new RivaScopeError('no client');
	expect(e).toBeInstanceOf(RivaError);
	expect(e).toBeInstanceOf(RivaScopeError);
	expect(e.code).toBe('RIVA_SCOPE');
	expect(e.name).toBe('RivaScopeError');
});
