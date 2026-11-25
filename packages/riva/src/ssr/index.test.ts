import { afterEach, expect, test } from 'bun:test';
import { createRivaClient } from '../client';
import { RivaScopeError } from '../errors';
import { signal } from '../signal';
import * as ssr from './index';

afterEach(() => ssr.setScopeResolver(undefined));

test('the subpath exports the snapshot functions and the scope resolver', () => {
	expect(Object.keys(ssr).sort()).toEqual([
		'decode',
		'dehydrate',
		'encode',
		'hydrate',
		'setScopeResolver',
	]);
});

test('a resolver supplies the ambient client, after client.run', () => {
	const fromResolver = createRivaClient();
	const inRun = createRivaClient();
	const n = signal(0);
	expect(() => n.get()).toThrow(RivaScopeError);
	ssr.setScopeResolver(() => fromResolver);
	n.set(1);
	expect(fromResolver.get(n)).toBe(1);
	inRun.run(() => n.set(2));
	expect(inRun.get(n)).toBe(2);
	expect(fromResolver.get(n)).toBe(1);
});

test('a resolver with no client still hits the server guard, and can be removed', () => {
	const n = signal(0);
	ssr.setScopeResolver(() => undefined);
	expect(() => n.get()).toThrow(RivaScopeError);
	const c = createRivaClient();
	ssr.setScopeResolver(() => c);
	expect(n.get()).toBe(0);
	ssr.setScopeResolver(undefined);
	expect(() => n.get()).toThrow(RivaScopeError);
});

test('the resolver wins over the browser default client', async () => {
	const { setDefaultClient } = await import('../scope');
	const g = globalThis as { document?: unknown };
	g.document = {};
	try {
		const fallback = createRivaClient();
		const fromResolver = createRivaClient();
		const n = signal(0);
		setDefaultClient(fallback);
		n.set(1);
		expect(fallback.get(n)).toBe(1);
		ssr.setScopeResolver(() => fromResolver);
		n.set(2);
		expect(fromResolver.get(n)).toBe(2);
		expect(fallback.get(n)).toBe(1);
		ssr.setScopeResolver(() => undefined);
		expect(n.get()).toBe(1);
	} finally {
		setDefaultClient(undefined);
		g.document = undefined;
		delete g.document;
	}
});
