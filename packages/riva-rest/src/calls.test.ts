import { expect, test } from 'bun:test';
import { createRiva } from '@softistx/riva';
import { fakeTransport } from '../test/fixtures';
import { callsOf } from './calls';
import { provideRest } from './transport';

const resolve = (method: string, path: string) => ({
	id: `${method} ${path}`,
	method,
	path,
	operationId: '',
	hasInput: true,
});

function setup(cache?: never) {
	const calls: string[] = [];
	const riva = createRiva();
	provideRest(
		riva,
		fakeTransport(async (route) => {
			calls.push(`${route.method} ${route.path}`);
			return { n: calls.length };
		}),
	);
	return { calls, c: callsOf(riva, resolve, cache) };
}

test('one definition per method and path: a repeated get is cached and deduped', async () => {
	const { calls, c } = setup();
	const [a, b] = await Promise.all([c.get('/a', {}), c.get('/a', {})]);
	expect(a).toBe(b);
	expect(calls).toEqual(['get /a']);
	await c.get('/b', {});
	expect(calls).toEqual(['get /a', 'get /b']);
});

test('mutate runs the call, then marks the invalidated paths stale', async () => {
	const { calls, c } = setup();
	await c.get('/a', {}, { staleTime: '1h' });
	await c.get('/a', {}, { staleTime: '1h' });
	expect(calls).toEqual(['get /a']);
	await c.mutate('post', '/a', { json: 1 }, { invalidates: ['/a'] });
	await c.get('/a', {}, { staleTime: '1h' });
	expect(calls).toEqual(['get /a', 'post /a', 'get /a']);
});

test('a failing mutation invalidates nothing', async () => {
	const riva = createRiva();
	let reads = 0;
	provideRest(
		riva,
		fakeTransport(async (r) => {
			if (r.method === 'post') throw new Error('no');
			reads++;
		}),
	);
	const c = callsOf(riva, resolve, undefined);
	await c.get('/a', {}, { staleTime: '1h' });
	await expect(
		c.mutate('post', '/a', {}, { invalidates: ['/a'] }),
	).rejects.toThrow('no');
	await c.get('/a', {}, { staleTime: '1h' });
	expect(reads).toBe(1);
});

test('a bad route throws before anything runs, at mutation() time for a handle', () => {
	const riva = createRiva();
	const c = callsOf(
		riva,
		() => {
			throw new Error('unknown route');
		},
		undefined,
	);
	expect(() => c.mutation('post', '/x')).toThrow('unknown route');
	expect(c.mutate('post', '/x')).rejects.toThrow('unknown route');
});
