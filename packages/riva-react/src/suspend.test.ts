import { expect, test } from 'bun:test';
import { query } from '@softistx/riva';
import { deferred, newRiva } from '../test/render';
import { suspend } from './suspend';

test('the same riva and key get the same promise until it settles', async () => {
	const gate = deferred<number>();
	let calls = 0;
	const q = query<{ id: number }, number>({
		id: 'suspend/a',
		retry: 0,
		fetch: () => {
			calls++;
			return gate.promise;
		},
	});
	const riva = newRiva();
	const a = suspend(riva, q, 'k', { id: 1 });
	expect(suspend(riva, q, 'k', { id: 1 })).toBe(a);
	expect(calls).toBe(1);
	gate.resolve(1);
	await a;
	expect(suspend(riva, q, 'k', { id: 1 })).not.toBe(a);
});

test('another riva never shares the promise', () => {
	const q = query<void, number>({
		id: 'suspend/b',
		retry: 0,
		fetch: () => new Promise(() => {}),
	});
	const a = newRiva();
	const b = newRiva();
	expect(suspend(a, q, 'k', undefined)).not.toBe(suspend(b, q, 'k', undefined));
});

test('a failed fetch resolves the promise: the error is read from the state', async () => {
	const q = query<void, number>({
		id: 'suspend/c',
		retry: 0,
		fetch: () => Promise.reject(new Error('boom')),
	});
	const riva = newRiva();
	await suspend(riva, q, 'k', undefined);
	expect(riva.get(q).status).toBe('error');
});
