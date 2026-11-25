import { afterEach, expect, test } from 'bun:test';
import { atom } from '../atom';
import { createRivaClient } from '../client';
import { RivaScopeError } from '../errors';
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
	const n = atom(0);
	expect(() => n.get()).toThrow(RivaScopeError);
	ssr.setScopeResolver(() => fromResolver);
	n.set(1);
	expect(fromResolver.get(n)).toBe(1);
	inRun.run(() => n.set(2));
	expect(inRun.get(n)).toBe(2);
	expect(fromResolver.get(n)).toBe(1);
});

test('a resolver with no client still hits the server guard, and can be removed', () => {
	const n = atom(0);
	ssr.setScopeResolver(() => undefined);
	expect(() => n.get()).toThrow(RivaScopeError);
	const c = createRivaClient();
	ssr.setScopeResolver(() => c);
	expect(n.get()).toBe(0);
	ssr.setScopeResolver(undefined);
	expect(() => n.get()).toThrow(RivaScopeError);
});
