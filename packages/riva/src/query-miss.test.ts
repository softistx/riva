import { expect, test } from 'bun:test';
import { atom } from './atom';
import { createRivaClient } from './client';
import type { RivaError } from './errors';
import { type CachePolicy, query } from './query';

const flush = () => new Promise<void>((r) => setTimeout(r, 5));

/** A policy that reads `undefined` while `holes` holds a hole (an evicted entity, a missing field). */
function setup(holeAfterFetch: boolean) {
	const holes = atom(false);
	const cache: CachePolicy<unknown> = {
		write: (_c, data) => data,
		read: (c, stored) => (c.get(holes) ? undefined : stored),
		release: () => {},
	};
	let calls = 0;
	const client = createRivaClient();
	const q = query<void, unknown>({
		id: 'miss',
		cache,
		fetch: async () => {
			calls++;
			client.set(holes, holeAfterFetch);
			return { n: calls };
		},
	});
	return { q, client, holes, calls: () => calls };
}

test('an observed query whose stored data can no longer be read is refetched once', async () => {
	const { q, client, holes, calls } = setup(false);
	const off = client.subscribe(q, () => {});
	await flush();
	expect(calls()).toBe(1);
	expect(client.get(q).data).toEqual({ n: 1 });
	// An entity is evicted: the stored data reads undefined, the fetch repairs it.
	client.set(holes, true);
	await flush();
	expect(calls()).toBe(2);
	expect(client.get(q)).toMatchObject({ status: 'success', data: { n: 2 } });
	off();
});

test('a refetch that stays incomplete ends in an error and never loops', async () => {
	const { q, client, calls } = setup(true);
	const off = client.subscribe(q, () => {});
	await flush();
	await flush();
	expect(calls()).toBe(2);
	const state = client.get(q);
	expect(state.status).toBe('error');
	expect((state.error as RivaError).code).toBe('RIVA_CACHE');
	expect((state.error as RivaError).message).toBe(
		"The query's result is incomplete in the cache: the server did not return every selected field.",
	);
	off();
});
