import { describe, expect, test } from 'bun:test';
import { createRivaClient, type RivaClient } from './client';
import type { Scheduler } from './env';
import {
	RivaAbortError,
	RivaError,
	RivaHttpError,
	RivaNetworkError,
} from './errors';
import { at, mutation } from './mutation';
import { type CachePolicy, type QueryState, query } from './query';

function fakeScheduler() {
	let t = 1_000_000;
	let id = 0;
	const timers = new Map<number, { at: number; fn: () => void }>();
	const sched: Scheduler & { advance(ms: number): void; count(): number } = {
		now: () => t,
		setTimeout(fn, ms) {
			timers.set(++id, { at: t + ms, fn });
			return id;
		},
		clearTimeout: (h) => void timers.delete(h as number),
		count: () => timers.size,
		advance(ms) {
			t += ms;
			for (const [k, x] of [...timers])
				if (x.at <= t) {
					timers.delete(k);
					x.fn();
				}
		},
	};
	return sched;
}

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((a, b) => {
		resolve = a;
		reject = b;
	});
	return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

let server: string[] = [];
let fetches = 0;
const list = query<void, string[]>({
	id: 'list',
	staleTime: '1h',
	fetch: async () => {
		fetches++;
		return [...server];
	},
});
const byId = query<{ id: string }, string[]>({
	id: 'byId',
	fetch: async (v) => [v.id],
});

const add = (opts: { run?: (v: string) => Promise<string>; retry?: number }) =>
	mutation<string, string>({
		id: 'add',
		...(opts.retry === undefined ? {} : { retry: opts.retry }),
		retryDelay: () => 100,
		run: opts.run ?? (async (v) => v),
		optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
	});

function watch(client: RivaClient) {
	const seen: Array<string[] | undefined> = [];
	const off = client.subscribe(list, (s: QueryState<string[]>) =>
		seen.push(s.data),
	);
	return { seen, off };
}

async function seeded(): Promise<{
	client: RivaClient;
	sched: ReturnType<typeof fakeScheduler>;
}> {
	server = ['a'];
	const sched = fakeScheduler();
	const client = createRivaClient({ scheduler: sched });
	await list.ensure(client);
	return { client, sched };
}

describe('the optimistic layer on a keyed query', () => {
	test('is visible at once and rolled back on error, status untouched', async () => {
		const { client } = await seeded();
		const d = deferred<string>();
		const m = add({ run: () => d.promise });
		const p = m.run(client, 'b');
		expect(client.get(list).data).toEqual(['a', 'b']);
		expect(client.get(list).status).toBe('success');
		expect(client.get(list).isFetching).toBe(false);
		d.reject(new RivaHttpError(400));
		await expect(p).rejects.toBeInstanceOf(RivaHttpError);
		expect(client.get(list).data).toEqual(['a']);
	});

	test('success swaps the layer for the server result with no intermediate state', async () => {
		const { client } = await seeded();
		const d = deferred<string>();
		const m = mutation<string, string>({
			id: 'add',
			run: () => d.promise,
			optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
			updates: (tx, data) =>
				tx.set(list, undefined, (p) => [...(p ?? []), data]),
		});
		const w = watch(client);
		w.seen.length = 0;
		const p = m.run(client, 'tmp');
		expect(w.seen).toEqual([['a', 'tmp']]);
		d.resolve('real');
		expect(await p).toBe('real');
		expect(w.seen).toEqual([
			['a', 'tmp'],
			['a', 'real'],
		]);
		expect(client.get(list).data).toEqual(['a', 'real']);
		w.off();
	});

	test('a plain value layer works and updaters see the value below', async () => {
		const { client } = await seeded();
		const d = deferred<string>();
		const m = mutation<void, string>({
			id: 'm',
			run: () => d.promise,
			optimistic: (_, tx) => {
				tx.set(list, undefined, ['x']);
				tx.set(list, undefined, (p) => [...(p ?? []), 'y']);
			},
		});
		const p = m.run(client);
		expect(client.get(list).data).toEqual(['x', 'y']);
		d.resolve('');
		await p;
		expect(client.get(list).data).toEqual(['a']);
	});

	test('a refetch during a layer updates the committed value; the layer stays on top', async () => {
		const { client } = await seeded();
		const d = deferred<string>();
		const p = add({ run: () => d.promise }).run(client, 'b');
		server = ['a', 'z'];
		await list.ensure(client).catch(() => {});
		list.invalidate(client);
		const off = client.subscribe(list, () => {});
		await tick();
		expect(client.get(list).data).toEqual(['a', 'z', 'b']);
		d.reject(new Error('x'));
		await p.catch(() => {});
		expect(client.get(list).data).toEqual(['a', 'z']);
		off();
	});
});

describe('ordering', () => {
	test('out-of-order completion commits in start order', async () => {
		const { client } = await seeded();
		const da = deferred<string>();
		const db = deferred<string>();
		const order: string[] = [];
		const mk = (name: string, d: ReturnType<typeof deferred<string>>) =>
			mutation<void, string>({
				id: name,
				run: () => d.promise,
				updates: () => void order.push(name),
			});
		const a = mk('A', da).run(client);
		const b = mk('B', db).run(client);
		db.resolve('b');
		await tick();
		expect(order).toEqual([]);
		da.resolve('a');
		await Promise.all([a, b]);
		expect(order).toEqual(['A', 'B']);
	});

	test('B keeps its layer while A is pending, then both settle in order', async () => {
		const { client } = await seeded();
		const da = deferred<string>();
		const db = deferred<string>();
		const a = add({ run: () => da.promise }).run(client, 'A');
		const b = add({ run: () => db.promise }).run(client, 'B');
		expect(client.get(list).data).toEqual(['a', 'A', 'B']);
		db.resolve('B');
		await tick();
		expect(client.get(list).data).toEqual(['a', 'A', 'B']);
		da.reject(new RivaNetworkError());
		await expect(a).rejects.toBeInstanceOf(RivaNetworkError);
		await b;
		// A's layer is gone at once; B's layer is replaced by its (absent) commit.
		expect(client.get(list).data).toEqual(['a']);
	});

	test('A failing drops only its layer while B is still in flight', async () => {
		const { client } = await seeded();
		const da = deferred<string>();
		const db = deferred<string>();
		const a = add({ run: () => da.promise }).run(client, 'A');
		const b = add({ run: () => db.promise }).run(client, 'B');
		da.reject(new Error('no'));
		await a.catch(() => {});
		expect(client.get(list).data).toEqual(['a', 'B']);
		db.resolve('B');
		await b;
	});
});

describe('settle', () => {
	test('invalidates (both forms) marks stale and refetches observed entries', async () => {
		const { client } = await seeded();
		const off = client.subscribe(list, () => {});
		await byId.ensure(client, { id: '1' });
		const offOne = client.subscribe(byId, { id: '1' }, () => {});
		await tick();
		const before = fetches;
		server = ['a', 'b'];
		await mutation<void, string>({
			id: 'm',
			run: async () => 'ok',
			invalidates: [list],
		}).run(client);
		await tick();
		expect(fetches).toBe(before + 1);
		expect(client.get(list).data).toEqual(['a', 'b']);
		server = ['c'];
		await mutation<void, string>({
			id: 'm',
			run: async () => 'ok',
			invalidates: (data) => [list, at(byId, { id: data })],
		}).run(client);
		await tick();
		expect(client.get(list).data).toEqual(['c']);
		off();
		offOne();
	});

	test('invalidates after a failure does nothing', async () => {
		const { client } = await seeded();
		const off = client.subscribe(list, () => {});
		const before = fetches;
		await mutation<void, string>({
			id: 'm',
			run: async () => {
				throw new Error('x');
			},
			invalidates: [list],
			updates: () => {
				throw new Error('never');
			},
		})
			.run(client)
			.catch(() => {});
		await tick();
		expect(fetches).toBe(before);
		off();
	});

	test('updates writes the committed data with the committed value as prev', async () => {
		const { client } = await seeded();
		const d = deferred<string>();
		const m = mutation<string, string>({
			id: 'm',
			run: () => d.promise,
			optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
			updates: (tx, data) =>
				tx.set(list, undefined, (p) => [...(p ?? []), data]),
		});
		const p = m.run(client, 'tmp');
		d.resolve('real');
		await p;
		expect(client.get(list).data).toEqual(['a', 'real']);
		expect(client.get(list).updatedAt).toBeGreaterThan(0);
	});

	test('a refused commit rolls back and rejects with RIVA_CACHE', async () => {
		const { client } = await seeded();
		const cache: CachePolicy<unknown> = {
			write: (_c, d) => d,
			read: (_c, s) => s,
			release: () => {},
			commit: () => {
				throw new RivaError('RIVA_CACHE', 'refused');
			},
		};
		const m = mutation<string, string>({
			id: 'm',
			cache,
			run: async (v) => v,
			optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
			invalidates: [list],
		});
		const p = m.run(client, 'b');
		expect(client.get(list).data).toEqual(['a', 'b']);
		await expect(p).rejects.toMatchObject({ code: 'RIVA_CACHE' });
		expect(client.get(list).data).toEqual(['a']);
	});

	test('an optimistic function that throws rejects and leaves no layer', async () => {
		const { client } = await seeded();
		const m = mutation<void, string>({
			id: 'm',
			run: async () => 'x',
			optimistic: (_, tx) => {
				tx.set(list, undefined, ['half']);
				throw new Error('boom');
			},
		});
		await expect(m.run(client)).rejects.toThrow('boom');
		expect(client.get(list).data).toEqual(['a']);
	});
});

describe('retry and abort', () => {
	test('retries with the backoff helper, keeping the layer, then succeeds', async () => {
		const { client, sched } = await seeded();
		let n = 0;
		const m = add({
			retry: 2,
			run: async (v) => {
				if (++n < 3) throw new RivaNetworkError();
				return v;
			},
		});
		const p = m.run(client, 'b');
		await tick();
		expect(n).toBe(1);
		expect(client.get(list).data).toEqual(['a', 'b']);
		sched.advance(100);
		await tick();
		sched.advance(100);
		expect(await p).toBe('b');
		expect(n).toBe(3);
	});

	test('rolls back after the retries are spent', async () => {
		const { client, sched } = await seeded();
		let n = 0;
		const p = add({
			retry: 1,
			run: async () => {
				n++;
				throw new RivaHttpError(503);
			},
		}).run(client, 'b');
		await tick();
		sched.advance(100);
		await expect(p).rejects.toBeInstanceOf(RivaHttpError);
		expect(n).toBe(2);
		expect(client.get(list).data).toEqual(['a']);
	});

	test('a non-retryable error is not retried; the default is no retry', async () => {
		const { client } = await seeded();
		let n = 0;
		await add({
			retry: 5,
			run: async () => {
				n++;
				throw new RivaHttpError(400);
			},
		})
			.run(client, 'b')
			.catch(() => {});
		await add({
			run: async () => {
				n++;
				throw new RivaNetworkError();
			},
		})
			.run(client, 'b')
			.catch(() => {});
		expect(n).toBe(2);
	});

	test('an abort rejects with RivaAbortError and rolls back', async () => {
		const { client } = await seeded();
		const ctl = new AbortController();
		const p = add({ run: () => new Promise<string>(() => {}) }).run(
			client,
			'b',
			{
				signal: ctl.signal,
			},
		);
		expect(client.get(list).data).toEqual(['a', 'b']);
		ctl.abort();
		await expect(p).rejects.toBeInstanceOf(RivaAbortError);
		expect(client.get(list).data).toEqual(['a']);
	});

	test('an already aborted signal rejects before anything runs', async () => {
		const { client } = await seeded();
		const ctl = new AbortController();
		ctl.abort();
		let ran = false;
		await expect(
			add({
				run: async () => {
					ran = true;
					return 'x';
				},
			}).run(client, 'b', {
				signal: ctl.signal,
			}),
		).rejects.toBeInstanceOf(RivaAbortError);
		expect(ran).toBe(false);
		expect(client.get(list).data).toEqual(['a']);
	});
});

describe('clients and the server', () => {
	test('two clients never share layers or the order', async () => {
		const c1 = createRivaClient({ scheduler: fakeScheduler() });
		const c2 = createRivaClient({ scheduler: fakeScheduler() });
		server = ['a'];
		await list.ensure(c1);
		await list.ensure(c2);
		const d1 = deferred<string>();
		const p1 = add({ run: () => d1.promise }).run(c1, 'one');
		expect(c2.get(list).data).toEqual(['a']);
		// c2's mutation does not wait for c1's pending one.
		expect(await add({}).run(c2, 'two')).toBe('two');
		expect(c1.get(list).data).toEqual(['a', 'one']);
		d1.resolve('one');
		await p1;
	});

	test('runs on the server with no timer armed', async () => {
		expect('document' in globalThis).toBe(false);
		const sched = fakeScheduler();
		const client = createRivaClient({ scheduler: sched });
		server = ['a'];
		await list.ensure(client);
		await add({}).run(client, 'b');
		await add({ run: async () => Promise.reject(new Error('x')) })
			.run(client, 'c')
			.catch(() => {});
		expect(sched.count()).toBe(0);
		expect(client.get(list).data).toEqual(['a']);
	});
});

describe('review fixes', () => {
	test('an abort while held behind an earlier mutation drops the layer and never commits', async () => {
		const { client } = await seeded();
		const da = deferred<string>();
		const order: string[] = [];
		const a = add({ run: () => da.promise }).run(client, 'A');
		const ctl = new AbortController();
		const db = deferred<string>();
		const b = mutation<string, string>({
			id: 'B',
			run: () => db.promise,
			optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
			updates: () => void order.push('B'),
		}).run(client, 'B', { signal: ctl.signal });
		db.resolve('B');
		await tick();
		expect(client.get(list).data).toEqual(['a', 'A', 'B']);
		ctl.abort();
		await expect(b).rejects.toBeInstanceOf(RivaAbortError);
		expect(client.get(list).data).toEqual(['a', 'A']);
		da.resolve('A');
		await a;
		await tick();
		expect(order).toEqual([]);
		// later mutations are not blocked by the aborted one
		expect(await add({}).run(client, 'C')).toBe('C');
	});

	test('a throwing invalidates function rolls back and rejects', async () => {
		const { client } = await seeded();
		const m = mutation<string, string>({
			id: 'm',
			run: async (v) => v,
			optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
			invalidates: () => {
				throw new Error('inv');
			},
		});
		await expect(m.run(client, 'b')).rejects.toThrow('inv');
		expect(client.get(list).data).toEqual(['a']);
	});

	test('a throwing updates keeps the server commit, drops the layers, invalidates, then rejects', async () => {
		const { client } = await seeded();
		const off = client.subscribe(list, () => {});
		const before = fetches;
		server = ['a', 'srv'];
		const m = mutation<string, string>({
			id: 'm',
			run: async (v) => v,
			optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
			updates: () => {
				throw new Error('upd');
			},
			invalidates: [list],
		});
		await expect(m.run(client, 'b')).rejects.toThrow('upd');
		await tick();
		expect(fetches).toBe(before + 1);
		expect(client.get(list).data).toEqual(['a', 'srv']);
		off();
	});
});
