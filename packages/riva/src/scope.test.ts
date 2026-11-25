import { afterEach, expect, test } from 'bun:test';
import { createRiva } from './client';
import { RivaError, RivaScopeError } from './errors';
import { setDefaultRiva } from './scope';
import { signal } from './signal';

const g = globalThis as { document?: unknown };
afterEach(() => {
	delete g.document;
});

test('server read with no riva throws a RivaScopeError naming the fix', () => {
	const a = signal(1);
	expect(() => a.get()).toThrow(RivaScopeError);
	try {
		a.get();
	} catch (e) {
		expect(e).toBeInstanceOf(RivaError);
		expect((e as RivaScopeError).code).toBe('RIVA_SCOPE');
		expect((e as Error).message).toContain('riva.run');
		expect((e as Error).message).toContain('riva.get(def)');
	}
	expect(() => a.set(2)).toThrow(RivaScopeError);
	expect(() => a.subscribe(() => {})).toThrow(RivaScopeError);
});

test('setDefaultRiva throws on the server', () => {
	expect(() => setDefaultRiva(createRiva())).toThrow(RivaScopeError);
});

test('browser falls back to the default riva', () => {
	g.document = {};
	const riva = createRiva();
	setDefaultRiva(riva);
	const a = signal(1);
	a.set(5);
	expect(a.get()).toBe(5);
	expect(riva.get(a)).toBe(5);
	setDefaultRiva(undefined);
	expect(() => a.get()).toThrow(RivaScopeError);
});

test('run takes precedence over the default riva', () => {
	g.document = {};
	const def = createRiva();
	const other = createRiva();
	setDefaultRiva(def);
	const a = signal(0);
	other.run(() => a.set(1));
	expect(def.get(a)).toBe(0);
	expect(other.get(a)).toBe(1);
	setDefaultRiva(undefined);
});

test('run nests, restores the previous scope and restores on throw', () => {
	const a = signal(0);
	const c1 = createRiva();
	const c2 = createRiva();
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
	expect(createRiva().run(() => 42)).toBe(42);
});
