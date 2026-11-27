import { describe, expect, test } from 'bun:test';
import { createRiva, type Riva } from './client';
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

const add = (opts: {
	mutate?: (v: string) => Promise<string>;
	retry?: number;
}) =>
	mutation<string, string>({
		id: 'add',
		...(opts.retry === undefined ? {} : { retry: opts.retry }),
		retryDelay: () => 100,
		mutate: opts.mutate ?? (async (v) => v),
		optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
	});

function watch(riva: Riva) {
	const seen: Array<string[] | undefined> = [];
	const off = riva.subscribe(list, (s: QueryState<string[]>) =>
		seen.push(s.data),
	);
	return { seen, off };
}

async function seeded(): Promise<{
	riva: Riva;
	sched: ReturnType<typeof fakeScheduler>;
}> {
	server = ['a'];
	const sched = fakeScheduler();
	const riva = createRiva({ scheduler: sched });
	await list.ensure(riva);
	return { riva, sched };
}

describe('the optimistic layer on a keyed query', () => {
	test('is visible at once and rolled back on error, status untouched', async () => {
		const { riva } = await seeded();
		const d = deferred<string>();
		const m = add({ mutate: () => d.promise });
		const p = m.mutate(riva, 'b');
		expect(riva.get(list).data).toEqual(['a', 'b']);
		expect(riva.get(list).status).toBe('success');
		expect(riva.get(list).isFetching).toBe(false);
		d.reject(new RivaHttpError(400));
		await expect(p).rejects.toBeInstanceOf(RivaHttpError);
		expect(riva.get(list).data).toEqual(['a']);
	});

	test('success swaps the layer for the server result with no intermediate state', async () => {
		const { riva } = await seeded();
		const d = deferred<string>();
		const m = mutation<string, string>({
			id: 'add',
			mutate: () => d.promise,
			optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
			updates: (tx, data) =>
				tx.set(list, undefined, (p) => [...(p ?? []), data]),
		});
		const w = watch(riva);
		w.seen.length = 0;
		const p = m.mutate(riva, 'tmp');
		expect(w.seen).toEqual([['a', 'tmp']]);
		d.resolve('real');
		expect(await p).toBe('real');
		expect(w.seen).toEqual([
			['a', 'tmp'],
			['a', 'real'],
		]);
		expect(riva.get(list).data).toEqual(['a', 'real']);
		w.off();
	});

	test('a plain value layer works and updaters see the value below', async () => {
		const { riva } = await seeded();
		const d = deferred<string>();
		const m = mutation<void, string>({
			id: 'm',
			mutate: () => d.promise,
			optimistic: (_, tx) => {
				tx.set(list, undefined, ['x']);
				tx.set(list, undefined, (p) => [...(p ?? []), 'y']);
			},
		});
		const p = m.mutate(riva);
		expect(riva.get(list).data).toEqual(['x', 'y']);
		d.resolve('');
		await p;
		expect(riva.get(list).data).toEqual(['a']);
	});

	test('a refetch during a layer updates the committed value; the layer stays on top', async () => {
		const { riva } = await seeded();
		const d = deferred<string>();
		const p = add({ mutate: () => d.promise }).mutate(riva, 'b');
		server = ['a', 'z'];
		await list.ensure(riva).catch(() => {});
		list.invalidate(riva);
		const off = riva.subscribe(list, () => {});
		await tick();
		expect(riva.get(list).data).toEqual(['a', 'z', 'b']);
		d.reject(new Error('x'));
		await p.catch(() => {});
		expect(riva.get(list).data).toEqual(['a', 'z']);
		off();
	});
});

describe('ordering', () => {
	test('out-of-order completion commits in start order', async () => {
		const { riva } = await seeded();
		const da = deferred<string>();
		const db = deferred<string>();
		const order: string[] = [];
		const mk = (name: string, d: ReturnType<typeof deferred<string>>) =>
			mutation<void, string>({
				id: name,
				mutate: () => d.promise,
				updates: () => void order.push(name),
			});
		const a = mk('A', da).mutate(riva);
		const b = mk('B', db).mutate(riva);
		db.resolve('b');
		await tick();
		expect(order).toEqual([]);
		da.resolve('a');
		await Promise.all([a, b]);
		expect(order).toEqual(['A', 'B']);
	});

	test('B keeps its layer while A is pending, then both settle in order', async () => {
		const { riva } = await seeded();
		const da = deferred<string>();
		const db = deferred<string>();
		const a = add({ mutate: () => da.promise }).mutate(riva, 'A');
		const b = add({ mutate: () => db.promise }).mutate(riva, 'B');
		expect(riva.get(list).data).toEqual(['a', 'A', 'B']);
		db.resolve('B');
		await tick();
		expect(riva.get(list).data).toEqual(['a', 'A', 'B']);
		da.reject(new RivaNetworkError());
		await expect(a).rejects.toBeInstanceOf(RivaNetworkError);
		await b;
		// A's layer is gone at once; B's layer is replaced by its (absent) commit.
		expect(riva.get(list).data).toEqual(['a']);
	});

	test('A failing drops only its layer while B is still in flight', async () => {
		const { riva } = await seeded();
		const da = deferred<string>();
		const db = deferred<string>();
		const a = add({ mutate: () => da.promise }).mutate(riva, 'A');
		const b = add({ mutate: () => db.promise }).mutate(riva, 'B');
		da.reject(new Error('no'));
		await a.catch(() => {});
		expect(riva.get(list).data).toEqual(['a', 'B']);
		db.resolve('B');
		await b;
	});
});

describe('settle', () => {
	test('invalidates (both forms) marks stale and refetches observed entries', async () => {
		const { riva } = await seeded();
		const off = riva.subscribe(list, () => {});
		await byId.ensure(riva, { id: '1' });
		const offOne = riva.subscribe(byId, { id: '1' }, () => {});
		await tick();
		const before = fetches;
		server = ['a', 'b'];
		await mutation<void, string>({
			id: 'm',
			mutate: async () => 'ok',
			invalidates: [list],
		}).mutate(riva);
		await tick();
		expect(fetches).toBe(before + 1);
		expect(riva.get(list).data).toEqual(['a', 'b']);
		server = ['c'];
		await mutation<void, string>({
			id: 'm',
			mutate: async () => 'ok',
			invalidates: (data) => [list, at(byId, { id: data })],
		}).mutate(riva);
		await tick();
		expect(riva.get(list).data).toEqual(['c']);
		off();
		offOne();
	});

	test('invalidates after a failure does nothing', async () => {
		const { riva } = await seeded();
		const off = riva.subscribe(list, () => {});
		const before = fetches;
		await mutation<void, string>({
			id: 'm',
			mutate: async () => {
				throw new Error('x');
			},
			invalidates: [list],
			updates: () => {
				throw new Error('never');
			},
		})
			.mutate(riva)
			.catch(() => {});
		await tick();
		expect(fetches).toBe(before);
		off();
	});

	test('updates writes the committed data with the committed value as prev', async () => {
		const { riva } = await seeded();
		const d = deferred<string>();
		const m = mutation<string, string>({
			id: 'm',
			mutate: () => d.promise,
			optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
			updates: (tx, data) =>
				tx.set(list, undefined, (p) => [...(p ?? []), data]),
		});
		const p = m.mutate(riva, 'tmp');
		d.resolve('real');
		await p;
		expect(riva.get(list).data).toEqual(['a', 'real']);
		expect(riva.get(list).updatedAt).toBeGreaterThan(0);
	});

	test('a refused commit rolls back and rejects with RIVA_CACHE', async () => {
		const { riva } = await seeded();
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
			mutate: async (v) => v,
			optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
			invalidates: [list],
		});
		const p = m.mutate(riva, 'b');
		expect(riva.get(list).data).toEqual(['a', 'b']);
		await expect(p).rejects.toMatchObject({ code: 'RIVA_CACHE' });
		expect(riva.get(list).data).toEqual(['a']);
	});

	test('an optimistic function that throws rejects and leaves no layer', async () => {
		const { riva } = await seeded();
		const m = mutation<void, string>({
			id: 'm',
			mutate: async () => 'x',
			optimistic: (_, tx) => {
				tx.set(list, undefined, ['half']);
				throw new Error('boom');
			},
		});
		await expect(m.mutate(riva)).rejects.toThrow('boom');
		expect(riva.get(list).data).toEqual(['a']);
	});
});

describe('retry and abort', () => {
	test('retries with the backoff helper, keeping the layer, then succeeds', async () => {
		const { riva, sched } = await seeded();
		let n = 0;
		const m = add({
			retry: 2,
			mutate: async (v) => {
				if (++n < 3) throw new RivaNetworkError();
				return v;
			},
		});
		const p = m.mutate(riva, 'b');
		await tick();
		expect(n).toBe(1);
		expect(riva.get(list).data).toEqual(['a', 'b']);
		sched.advance(100);
		await tick();
		sched.advance(100);
		expect(await p).toBe('b');
		expect(n).toBe(3);
	});

	test('rolls back after the retries are spent', async () => {
		const { riva, sched } = await seeded();
		let n = 0;
		const p = add({
			retry: 1,
			mutate: async () => {
				n++;
				throw new RivaHttpError(503);
			},
		}).mutate(riva, 'b');
		await tick();
		sched.advance(100);
		await expect(p).rejects.toBeInstanceOf(RivaHttpError);
		expect(n).toBe(2);
		expect(riva.get(list).data).toEqual(['a']);
	});

	test('a non-retryable error is not retried; the default is no retry', async () => {
		const { riva } = await seeded();
		let n = 0;
		await add({
			retry: 5,
			mutate: async () => {
				n++;
				throw new RivaHttpError(400);
			},
		})
			.mutate(riva, 'b')
			.catch(() => {});
		await add({
			mutate: async () => {
				n++;
				throw new RivaNetworkError();
			},
		})
			.mutate(riva, 'b')
			.catch(() => {});
		expect(n).toBe(2);
	});

	test('an abort rejects with RivaAbortError and rolls back', async () => {
		const { riva } = await seeded();
		const ctl = new AbortController();
		const p = add({ mutate: () => new Promise<string>(() => {}) }).mutate(
			riva,
			'b',
			{
				signal: ctl.signal,
			},
		);
		expect(riva.get(list).data).toEqual(['a', 'b']);
		ctl.abort();
		await expect(p).rejects.toBeInstanceOf(RivaAbortError);
		expect(riva.get(list).data).toEqual(['a']);
	});

	test('an already aborted signal rejects before anything runs', async () => {
		const { riva } = await seeded();
		const ctl = new AbortController();
		ctl.abort();
		let ran = false;
		await expect(
			add({
				mutate: async () => {
					ran = true;
					return 'x';
				},
			}).mutate(riva, 'b', {
				signal: ctl.signal,
			}),
		).rejects.toBeInstanceOf(RivaAbortError);
		expect(ran).toBe(false);
		expect(riva.get(list).data).toEqual(['a']);
	});
});

describe('riva instances and the server', () => {
	test('two riva instances never share layers or the order', async () => {
		const c1 = createRiva({ scheduler: fakeScheduler() });
		const c2 = createRiva({ scheduler: fakeScheduler() });
		server = ['a'];
		await list.ensure(c1);
		await list.ensure(c2);
		const d1 = deferred<string>();
		const p1 = add({ mutate: () => d1.promise }).mutate(c1, 'one');
		expect(c2.get(list).data).toEqual(['a']);
		// c2's mutation does not wait for c1's pending one.
		expect(await add({}).mutate(c2, 'two')).toBe('two');
		expect(c1.get(list).data).toEqual(['a', 'one']);
		d1.resolve('one');
		await p1;
	});

	test('runs on the server with no timer armed', async () => {
		expect('document' in globalThis).toBe(false);
		const sched = fakeScheduler();
		const riva = createRiva({ scheduler: sched });
		server = ['a'];
		await list.ensure(riva);
		await add({}).mutate(riva, 'b');
		await add({ mutate: async () => Promise.reject(new Error('x')) })
			.mutate(riva, 'c')
			.catch(() => {});
		expect(sched.count()).toBe(0);
		expect(riva.get(list).data).toEqual(['a']);
	});
});

describe('review fixes', () => {
	test('an abort while held behind an earlier mutation drops the layer and never commits', async () => {
		const { riva } = await seeded();
		const da = deferred<string>();
		const order: string[] = [];
		const a = add({ mutate: () => da.promise }).mutate(riva, 'A');
		const ctl = new AbortController();
		const db = deferred<string>();
		const b = mutation<string, string>({
			id: 'B',
			mutate: () => db.promise,
			optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
			updates: () => void order.push('B'),
		}).mutate(riva, 'B', { signal: ctl.signal });
		db.resolve('B');
		await tick();
		expect(riva.get(list).data).toEqual(['a', 'A', 'B']);
		ctl.abort();
		await expect(b).rejects.toBeInstanceOf(RivaAbortError);
		expect(riva.get(list).data).toEqual(['a', 'A']);
		da.resolve('A');
		await a;
		await tick();
		expect(order).toEqual([]);
		// later mutations are not blocked by the aborted one
		expect(await add({}).mutate(riva, 'C')).toBe('C');
	});

	test('a throwing invalidates function rolls back and rejects', async () => {
		const { riva } = await seeded();
		const m = mutation<string, string>({
			id: 'm',
			mutate: async (v) => v,
			optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
			invalidates: () => {
				throw new Error('inv');
			},
		});
		await expect(m.mutate(riva, 'b')).rejects.toThrow('inv');
		expect(riva.get(list).data).toEqual(['a']);
	});

	test('a throwing updates keeps the server commit, drops the layers, invalidates, then rejects', async () => {
		const { riva } = await seeded();
		const off = riva.subscribe(list, () => {});
		const before = fetches;
		server = ['a', 'srv'];
		const m = mutation<string, string>({
			id: 'm',
			mutate: async (v) => v,
			optimistic: (v, tx) => tx.set(list, undefined, (p) => [...(p ?? []), v]),
			updates: () => {
				throw new Error('upd');
			},
			invalidates: [list],
		});
		await expect(m.mutate(riva, 'b')).rejects.toThrow('upd');
		await tick();
		expect(fetches).toBe(before + 1);
		expect(riva.get(list).data).toEqual(['a', 'srv']);
		off();
	});
});
