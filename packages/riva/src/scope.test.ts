import { afterEach, expect, test } from 'bun:test';
import { createRivaClient } from './client';
import { RivaError, RivaScopeError } from './errors';
import { setDefaultClient } from './scope';
import { signal } from './signal';

const g = globalThis as { document?: unknown };
afterEach(() => {
	delete g.document;
});

test('server read with no client throws a RivaScopeError naming the fix', () => {
	const a = signal(1);
	expect(() => a.get()).toThrow(RivaScopeError);
	try {
		a.get();
	} catch (e) {
		expect(e).toBeInstanceOf(RivaError);
		expect((e as RivaScopeError).code).toBe('RIVA_SCOPE');
		expect((e as Error).message).toContain('client.run');
		expect((e as Error).message).toContain('client.get(def)');
	}
	expect(() => a.set(2)).toThrow(RivaScopeError);
	expect(() => a.subscribe(() => {})).toThrow(RivaScopeError);
});

test('setDefaultClient throws on the server', () => {
	expect(() => setDefaultClient(createRivaClient())).toThrow(RivaScopeError);
});

test('browser falls back to the default client', () => {
	g.document = {};
	const client = createRivaClient();
	setDefaultClient(client);
	const a = signal(1);
	a.set(5);
	expect(a.get()).toBe(5);
	expect(client.get(a)).toBe(5);
	setDefaultClient(undefined);
	expect(() => a.get()).toThrow(RivaScopeError);
});

test('run takes precedence over the default client', () => {
	g.document = {};
	const def = createRivaClient();
	const other = createRivaClient();
	setDefaultClient(def);
	const a = signal(0);
	other.run(() => a.set(1));
	expect(def.get(a)).toBe(0);
	expect(other.get(a)).toBe(1);
	setDefaultClient(undefined);
});

test('run nests, restores the previous scope and restores on throw', () => {
	const a = signal(0);
	const c1 = createRivaClient();
	const c2 = createRivaClient();
	c1.run(() => {
		a.set(1);
		c2.run(() => a.set(2));
		expect(a.get()).toBe(1);
		expect(() =>
			c2.run(() => {
				throw new Error('x');
			}),
		).toThrow('x');
		expect(a.get()).toBe(1);
	});
	expect(c2.get(a)).toBe(2);
	expect(() => a.get()).toThrow(RivaScopeError);
});

test('run returns the result of fn', () => {
	expect(createRivaClient().run(() => 42)).toBe(42);
});
