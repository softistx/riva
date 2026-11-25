import { afterEach, expect, test } from 'bun:test';
import { createRiva } from './client';
import { computed } from './computed';
import type { RivaEvents, Scheduler } from './env';
import {
	RivaAbortError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
} from './errors';
import { type CachePolicy, type QueryState, query } from './query';

const g = globalThis as { document?: unknown };
const savedDocument = g.document;
afterEach(() => {
	if (savedDocument === undefined) delete g.document;
	else g.document = savedDocument;
});

const flush = () => new Promise<void>((r) => setImmediate(r));

function fakeScheduler() {
	let t = 1_000_000;
	let id = 0;
	const timers = new Map<number, { at: number; fn: () => void }>();
	const sched: Scheduler & {
		advance(ms: number): void;
		readonly pending: number;
	} = {
		now: () => t,
		setTimeout(fn, ms) {
			timers.set(++id, { at: t + ms, fn });
			return id;
		},
		clearTimeout: (h) => void timers.delete(h as number),
		advance(ms) {
			const end = t + ms;
			for (;;) {
				const next = [...timers.entries()]
					.filter(([, x]) => x.at <= end)
					.sort((a, b) => a[1].at - b[1].at)[0];
				if (!next) break;
				timers.delete(next[0]);
				t = next[1].at;
				next[1].fn();
			}
			t = end;
		},
		get pending() {
			return timers.size;
		},
	};
	return sched;
}

function fakeEvents() {
	const focus = new Set<() => void>();
	const online = new Set<() => void>();
	const events: RivaEvents & {
		fireFocus(): void;
		fireOnline(): void;
		readonly listeners: number;
	} = {
		onFocus: (cb) => {
			focus.add(cb);
			return () => focus.delete(cb);
		},
		onReconnect: (cb) => {
			online.add(cb);
			return () => online.delete(cb);
		},
		fireFocus: () => {
			for (const f of focus) f();
		},
		fireOnline: () => {
			for (const f of online) f();
		},
		get listeners() {
			return focus.size + online.size;
		},
	};
	return events;
}

/** A fetcher whose calls are resolved by hand. */
function manual<V = void, D = string>() {
	const calls: Array<{
		vars: V;
		signal: AbortSignal;
		resolve(d: D): void;
		reject(e: unknown): void;
	}> = [];
	const fetch = (vars: V, ctx: { signal: AbortSignal }) =>
		new Promise<D>((resolve, reject) => {
			calls.push({ vars, signal: ctx.signal, resolve, reject });
		});
	return { calls, fetch };
}

const setup = (
	opts: Parameters<typeof query>[0] extends never ? never : object = {},
) => {
	const scheduler = fakeScheduler();
	const events = fakeEvents();
	const riva = createRiva({ scheduler, events });
	return { scheduler, events, riva, opts };
};

test('ensure fetches once, then serves the cache while fresh', async () => {
	const { riva } = setup();
	let n = 0;
	const q = query({
		id: 'q',
		staleTime: '1m',
		fetch: async (v: { id: string }) => `${v.id}${++n}`,
	});
	expect(await q.ensure(riva, { id: 'a' })).toBe('a1');
	expect(await q.ensure(riva, { id: 'a' })).toBe('a1');
	expect(await q.ensure(riva, { id: 'b' })).toBe('b2');
	expect(n).toBe(2);
});

test('data goes stale after staleTime, fresh forever with Infinity', async () => {
	const { riva, scheduler } = setup();
	let n = 0;
	const q = query({ id: 'q', staleTime: '10s', fetch: async () => ++n });
	await q.ensure(riva);
	scheduler.advance(9_999);
	expect(await q.ensure(riva)).toBe(1);
	scheduler.advance(1);
	expect(await q.ensure(riva)).toBe(2);
	const forever = query({
		id: 'f',
		staleTime: Infinity,
		fetch: async () => ++n,
	});
	await forever.ensure(riva);
	scheduler.advance(10 ** 12);
	expect(await forever.ensure(riva)).toBe(3);
});

test('staleTime 0: every ensure refetches', async () => {
	const { riva } = setup();
	let n = 0;
	const q = query({ id: 'q', fetch: async () => ++n });
	await q.ensure(riva);
	await q.ensure(riva);
	expect(n).toBe(2);
});

test('concurrent ensure and subscribe share one fetch', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	const a = q.ensure(riva);
	const b = q.ensure(riva);
	const off = riva.subscribe(q, () => {});
	expect(m.calls.length).toBe(1);
	m.calls[0]?.resolve('x');
	expect(await a).toBe('x');
	expect(await b).toBe('x');
	off();
});

test('status transitions: idle, pending, success; background refetch keeps success', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	expect(riva.get(q).status).toBe('idle');
	const seen: Array<[string, boolean]> = [];
	const off = riva.subscribe(q, (s) => seen.push([s.status, s.isFetching]));
	expect(riva.get(q)).toMatchObject({
		status: 'pending',
		isFetching: true,
		data: undefined,
	});
	m.calls[0]?.resolve('one');
	await flush();
	const s = riva.get(q);
	expect(s).toMatchObject({
		status: 'success',
		data: 'one',
		isFetching: false,
	});
	expect(s.updatedAt).toBeGreaterThan(0);
	q.invalidate(riva);
	expect(riva.get(q)).toMatchObject({
		status: 'success',
		data: 'one',
		isFetching: true,
	});
	m.calls[1]?.resolve('two');
	await flush();
	expect(riva.get(q).data).toBe('two');
	expect(seen).toEqual([
		['pending', true],
		['success', false],
		['success', true],
		['success', false],
	]);
	off();
});

test('an error sets status error and keeps the last data', async () => {
	const { riva } = setup();
	let fail = false;
	const boom = new Error('boom');
	const q = query({
		id: 'q',
		fetch: async () => {
			if (fail) throw boom;
			return 'ok';
		},
	});
	await q.ensure(riva);
	fail = true;
	await expect(q.ensure(riva)).rejects.toBe(boom);
	expect(riva.get(q)).toMatchObject({
		status: 'error',
		error: boom,
		data: 'ok',
		isFetching: false,
	});
	fail = false;
	expect(await q.ensure(riva)).toBe('ok'); // an errored entry is refetched
	expect(riva.get(q).status).toBe('success');
});

test('prefetch never rejects and fetches in the background', async () => {
	const { riva } = setup();
	const q = query({
		id: 'q',
		fetch: async () => {
			throw new Error('x');
		},
	});
	q.prefetch(riva);
	await flush();
	expect(riva.get(q).status).toBe('error');
	const ok = query({ id: 'ok', staleTime: '1m', fetch: async () => 1 });
	ok.prefetch(riva);
	await flush();
	ok.prefetch(riva); // fresh: no second fetch
	expect(riva.get(ok).data).toBe(1);
});

test('retry: counts, backoff delays, then the last error', async () => {
	const { riva, scheduler } = setup();
	const delays: number[] = [];
	let calls = 0;
	const q = query({
		id: 'q',
		retry: 2,
		retryDelay: (n) => {
			delays.push(n);
			return 100 * (n + 1);
		},
		fetch: async () => {
			calls++;
			throw new RivaNetworkError();
		},
	});
	const p = q.ensure(riva);
	p.catch(() => {});
	await flush();
	expect(calls).toBe(1);
	scheduler.advance(99);
	await flush();
	expect(calls).toBe(1);
	scheduler.advance(1);
	await flush();
	expect(calls).toBe(2);
	scheduler.advance(200);
	await flush();
	expect(calls).toBe(3);
	await expect(p).rejects.toBeInstanceOf(RivaNetworkError);
	expect(delays).toEqual([0, 1]);
});

test('default backoff is 1 s, 2 s, 4 s in a browser; a success stops the retries', async () => {
	g.document = {};
	const { riva, scheduler } = setup();
	let calls = 0;
	const q = query({
		id: 'q',
		fetch: async () => {
			if (++calls < 3) throw new Error('flaky');
			return 'done';
		},
	});
	const p = q.ensure(riva);
	await flush();
	scheduler.advance(999);
	await flush();
	expect(calls).toBe(1);
	scheduler.advance(1);
	await flush();
	expect(calls).toBe(2);
	scheduler.advance(2000);
	await flush();
	expect(await p).toBe('done');
	expect(calls).toBe(3);
});

test('no retry on the server by default, on 4xx, retryable:false or abort', async () => {
	delete g.document;
	const { riva } = setup();
	for (const err of [
		new Error('plain on the server'),
		new RivaHttpError(404),
		new RivaRequestError('BAD_USER_INPUT', 'x', { retryable: false }),
		new RivaAbortError(),
	]) {
		g.document =
			err instanceof Error && err.message.startsWith('plain') ? undefined : {};
		if (g.document === undefined) delete g.document;
		let calls = 0;
		const q = query({
			id: `q${err.message}`,
			...(err.message.startsWith('plain') ? {} : { retry: 5 }),
			fetch: async () => {
				calls++;
				throw err;
			},
		});
		await expect(q.ensure(riva)).rejects.toBe(err);
		expect(calls).toBe(1);
	}
});

test('retry as a function sees the error', async () => {
	const { riva, scheduler } = setup();
	let calls = 0;
	const q = query({
		id: 'q',
		retry: (n, e) => n < 5 && (e as Error).message === 'again',
		retryDelay: () => 1,
		fetch: async () => {
			calls++;
			throw new Error(calls < 3 ? 'again' : 'stop');
		},
	});
	const p = q.ensure(riva);
	p.catch(() => {});
	for (let i = 0; i < 4; i++) {
		await flush();
		scheduler.advance(1);
	}
	await expect(p).rejects.toThrow('stop');
	expect(calls).toBe(3);
});

test('aborting during a retry wait cancels it', async () => {
	g.document = {};
	const { riva, scheduler } = setup();
	let calls = 0;
	const q = query({
		id: 'q',
		fetch: async () => {
			calls++;
			throw new Error('x');
		},
	});
	const ctl = new AbortController();
	const p = q.ensure(riva, undefined, { signal: ctl.signal });
	p.catch(() => {});
	await flush();
	ctl.abort();
	await expect(p).rejects.toBeInstanceOf(RivaAbortError);
	scheduler.advance(60_000);
	await flush();
	expect(calls).toBe(1);
	expect(riva.get(q).status).toBe('idle');
});

test('server defaults: no gc timer; browser: gc after 5 minutes', async () => {
	delete g.document;
	const server = setup();
	const q = query({ id: 'q', fetch: async () => 1 });
	await q.ensure(server.riva);
	const off = server.riva.subscribe(q, () => {});
	off();
	expect(server.scheduler.pending).toBe(0);

	g.document = {};
	const { riva, scheduler } = setup();
	await q.ensure(riva);
	expect(scheduler.pending).toBe(1);
	scheduler.advance(299_999);
	expect(riva.get(q).status).toBe('success');
	scheduler.advance(1);
	expect(riva.get(q).status).toBe('idle'); // collected, then recreated idle
});

test('gcTime: observed entries are kept, the last unsubscribe schedules collection', async () => {
	const { riva, scheduler } = setup();
	const q = query({
		id: 'q',
		gcTime: '1s',
		staleTime: Infinity,
		fetch: async () => 1,
	});
	const off = riva.subscribe(q, () => {});
	await flush();
	scheduler.advance(10_000);
	expect(riva.get(q).data).toBe(1);
	off();
	scheduler.advance(999);
	expect(riva.get(q).data).toBe(1);
	scheduler.advance(1);
	expect(riva.get(q).data).toBeUndefined();
});

test('gc waits while a computed still reads the entry', async () => {
	const { riva, scheduler } = setup();
	const q = query({
		id: 'q',
		gcTime: 100,
		staleTime: Infinity,
		fetch: async () => 1,
	});
	await q.ensure(riva);
	const view = computed(() => riva.get(q).data);
	const seen: unknown[] = [];
	const off = riva.subscribe(view, (v) => seen.push(v));
	scheduler.advance(1000);
	q.setData(riva, undefined, 2);
	expect(seen).toEqual([2]);
	off();
	scheduler.advance(1000);
	expect(riva.get(q).data).toBeUndefined();
});

test('a computed reading riva.get re-evaluates on state change', async () => {
	const { riva } = setup();
	const q = query({ id: 'q', fetch: async (v: { n: number }) => v.n * 2 });
	const label = computed(() => {
		const s = riva.get(q, { n: 4 });
		return s.status === 'success' ? `got ${s.data}` : s.status;
	});
	const seen: string[] = [];
	const off = riva.subscribe(label, (v) => seen.push(v));
	expect(riva.get(label)).toBe('idle');
	await q.ensure(riva, { n: 4 });
	expect(seen).toEqual(['pending', 'got 8']);
	off();
});

test('riva.get never fetches', async () => {
	const { riva } = setup();
	let n = 0;
	const q = query({ id: 'q', fetch: async () => ++n });
	riva.get(q);
	await flush();
	expect(n).toBe(0);
});

test('two riva instances are isolated', async () => {
	const a = setup().riva;
	const b = setup().riva;
	let n = 0;
	const q = query({ id: 'q', fetch: async () => ++n });
	await q.ensure(a);
	expect(a.get(q).data).toBe(1);
	expect(b.get(q).status).toBe('idle');
	q.setData(b, undefined, 9);
	expect(a.get(q).data).toBe(1);
});

test('refetch on focus and reconnect: observed, stale, opted-in only', async () => {
	const { riva, events, scheduler } = setup();
	let n = 0;
	const mk = (id: string, extra: object = {}) =>
		query({ id, fetch: async () => `${id}${++n}`, ...extra });
	const normal = mk('normal');
	const fresh = mk('fresh', { staleTime: '1m' });
	const noFocus = mk('noFocus', { refetchOnFocus: false });
	const noOnline = mk('noOnline', { refetchOnReconnect: false });
	const unobserved = mk('unobserved');
	const offs = [normal, fresh, noFocus, noOnline].map((q) =>
		riva.subscribe(q, () => {}),
	);
	await queueAll(normal, fresh, noFocus, noOnline, unobserved);
	await unobserved.ensure(riva);
	const before = n;
	events.fireFocus();
	await flush();
	expect(n - before).toBe(2); // normal and noOnline; not fresh, noFocus or unobserved
	scheduler.advance(0);
	const mid = n;
	events.fireOnline();
	await flush();
	expect(n - mid).toBe(2); // normal and noFocus
	for (const off of offs) off();
	expect(events.listeners).toBe(0);

	async function queueAll(
		...qs: Array<{ ensure(c: typeof riva): Promise<unknown> }>
	) {
		await flush();
		for (const q of qs.slice(0, 4)) await q.ensure(riva).catch(() => {});
	}
});

test('events attach with the first observer and detach with the last', () => {
	const { riva, events } = setup();
	const q = query({ id: 'q', fetch: async () => 1 });
	const r = query({ id: 'r', fetch: async () => 1 });
	expect(events.listeners).toBe(0);
	const a = riva.subscribe(q, () => {});
	const b = riva.subscribe(r, () => {});
	expect(events.listeners).toBe(2);
	a();
	a(); // idempotent
	expect(events.listeners).toBe(2);
	b();
	expect(events.listeners).toBe(0);
});

test('a refetch on focus skips an entry already fetching', async () => {
	const { riva, events } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	const off = riva.subscribe(q, () => {});
	events.fireFocus();
	expect(m.calls.length).toBe(1);
	off();
});

test('polling runs while observed and stops with the last observer', async () => {
	const { riva, scheduler } = setup();
	let n = 0;
	g.document = {};
	const q = query({ id: 'q', refetchEvery: '30s', fetch: async () => ++n });
	const off = riva.subscribe(q, () => {});
	await flush();
	expect(n).toBe(1);
	scheduler.advance(30_000);
	await flush();
	expect(n).toBe(2);
	scheduler.advance(30_000);
	await flush();
	scheduler.advance(30_000);
	await flush();
	expect(n).toBe(4);
	const off2 = riva.subscribe(q, () => {});
	off();
	scheduler.advance(30_000);
	await flush();
	expect(n).toBe(5); // still one observer
	off2();
	scheduler.advance(300_000);
	await flush();
	expect(n).toBe(5);
});

test('invalidate: one entry or all, unobserved ones only marked stale', async () => {
	const { riva } = setup();
	let n = 0;
	const q = query({
		id: 'q',
		staleTime: Infinity,
		fetch: async (v: { id: string }) => `${v.id}${++n}`,
	});
	const other = query({
		id: 'q:b',
		staleTime: Infinity,
		fetch: async () => 'other',
	});
	await q.ensure(riva, { id: 'a' });
	await q.ensure(riva, { id: 'b' });
	await other.ensure(riva);
	const off = riva.subscribe(q, { id: 'a' }, () => {});
	q.invalidate(riva, { id: 'b' });
	await flush();
	expect(n).toBe(2); // b is unobserved: only marked
	expect(await q.ensure(riva, { id: 'b' })).toBe('b3'); // marked stale: refetched
	expect(await q.ensure(riva, { id: 'a' })).toBe('a1');
	q.invalidate(riva); // all entries of q, a is observed
	await flush();
	expect(riva.get(q, { id: 'a' }).data).toBe('a4');
	expect(await q.ensure(riva, { id: 'b' })).toBe('b5');
	expect(await other.ensure(riva)).toBe('other'); // another definition: untouched
	q.invalidate(riva, { id: 'never-fetched' }); // no entry: no-op
	off();
});

test('invalidate while in flight aborts and restarts; waiters get the new result', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	const off = riva.subscribe(q, () => {});
	const p = q.ensure(riva);
	q.invalidate(riva);
	await flush();
	expect(m.calls.length).toBe(2);
	expect(m.calls[0]?.signal.aborted).toBe(true);
	expect(m.calls[1]?.signal.aborted).toBe(false);
	m.calls[0]?.resolve('stale'); // an aborted fetch's result is ignored
	m.calls[1]?.resolve('fresh');
	expect(await p).toBe('fresh');
	expect(riva.get(q).data).toBe('fresh');
	off();
});

test('setData: value or updater, success state, updatedAt now', async () => {
	const { riva, scheduler } = setup();
	const q = query({ id: 'q', staleTime: '1m', fetch: async () => [1] });
	q.setData(riva, undefined, [5]);
	const s = riva.get(q);
	expect(s).toMatchObject({ status: 'success', data: [5], isFetching: false });
	expect(s.updatedAt).toBe(scheduler.now());
	q.setData(riva, undefined, (prev) => [...(prev ?? []), 6]);
	expect(riva.get(q).data).toEqual([5, 6]);
	expect(await q.ensure(riva)).toEqual([5, 6]); // fresh: no fetch
	q.setData(riva, undefined, (prev) => prev ?? []);
});

test('setData cancels a fetch in flight', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	q.prefetch(riva);
	q.setData(riva, undefined, 'manual');
	expect(m.calls[0]?.signal.aborted).toBe(true);
	m.calls[0]?.resolve('late');
	await flush();
	expect(riva.get(q).data).toBe('manual');
});

test('cancel aborts the fetch and restores the previous state', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	q.setData(riva, undefined, 'cached');
	const p = q.ensure(riva);
	p.catch(() => {});
	expect(riva.get(q).isFetching).toBe(true);
	q.cancel(riva);
	expect(m.calls[0]?.signal.aborted).toBe(true);
	expect(riva.get(q)).toMatchObject({
		status: 'success',
		data: 'cached',
		isFetching: false,
	});
	await expect(p).rejects.toBeInstanceOf(RivaAbortError);
	q.cancel(riva); // nothing in flight
	const fresh = query({ id: 'f', fetch: m.fetch });
	fresh.cancel(riva); // no entry
	fresh.prefetch(riva);
	fresh.cancel(riva);
	expect(riva.get(fresh).status).toBe('idle');
});

test('a caller signal rejects that caller only; the shared fetch lives while others wait', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	const a = new AbortController();
	const pa = q.ensure(riva, undefined, { signal: a.signal });
	const pb = q.ensure(riva);
	a.abort();
	await expect(pa).rejects.toBeInstanceOf(RivaAbortError);
	expect(m.calls[0]?.signal.aborted).toBe(false);
	m.calls[0]?.resolve('x');
	expect(await pb).toBe('x');
});

test('the fetch aborts when the last waiter leaves; the entry returns to its previous state', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	const a = new AbortController();
	const b = new AbortController();
	const pa = q.ensure(riva, undefined, { signal: a.signal });
	const pb = q.ensure(riva, undefined, { signal: b.signal });
	a.abort();
	b.abort();
	const both = Promise.allSettled([pa, pb]);
	for (const r of await both) expect(r.status).toBe('rejected');
	expect(m.calls[0]?.signal.aborted).toBe(true);
	expect(riva.get(q).status).toBe('idle'); // no error state
	await expect(
		q.ensure(riva, undefined, { signal: a.signal }),
	).rejects.toBeInstanceOf(RivaAbortError);
	expect(m.calls.length).toBe(1);
});

test('an observer keeps the fetch alive when a waiter aborts', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	const off = riva.subscribe(q, () => {});
	const a = new AbortController();
	const p = q.ensure(riva, undefined, { signal: a.signal });
	a.abort();
	await expect(p).rejects.toBeInstanceOf(RivaAbortError);
	expect(m.calls[0]?.signal.aborted).toBe(false);
	off(); // last one out: now it aborts
	expect(m.calls[0]?.signal.aborted).toBe(true);
	expect(riva.get(q).status).toBe('idle');
});

test('a fetcher that ignores the signal still cannot write after an abort', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	const a = new AbortController();
	const p = q.ensure(riva, undefined, { signal: a.signal });
	a.abort();
	await expect(p).rejects.toBeInstanceOf(RivaAbortError);
	m.calls[0]?.resolve('late');
	await flush();
	expect(riva.get(q).status).toBe('idle');
});

test('the fetcher receives its variables and the riva', async () => {
	const { riva } = setup();
	let seen: unknown;
	const q = query({
		id: 'q',
		fetch: async (v: { id: number }, ctx) => {
			seen = [v, ctx.riva === riva, ctx.signal instanceof AbortSignal];
			return 1;
		},
	});
	await q.ensure(riva, { id: 7 });
	expect(seen).toEqual([{ id: 7 }, true, true]);
});

test('subscribe with no variables, listener called on changes only', async () => {
	const { riva } = setup();
	const q = query({ id: 'q', fetch: async () => 1 });
	const states: QueryState<number>[] = [];
	const off = riva.subscribe(q, (s) => states.push(s));
	await flush();
	off();
	expect(states.map((s) => s.status)).toEqual(['pending', 'success']);
});

test('invalidate restarts an unobserved in-flight fetch: waiters get fresh data', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	const p = q.ensure(riva);
	q.invalidate(riva);
	await flush();
	expect(m.calls[0]?.signal.aborted).toBe(true);
	expect(m.calls.length).toBe(2);
	m.calls[1]?.resolve('fresh');
	expect(await p).toBe('fresh');
	expect(riva.get(q).data).toBe('fresh');
});

test('a caller abort does not cancel a prefetch it joined', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	q.prefetch(riva);
	const a = new AbortController();
	const p = q.ensure(riva, undefined, { signal: a.signal });
	a.abort();
	await expect(p).rejects.toBeInstanceOf(RivaAbortError);
	expect(m.calls[0]?.signal.aborted).toBe(false);
	m.calls[0]?.resolve('x');
	await flush();
	expect(riva.get(q).data).toBe('x');
});

test('polling arms no timer on the server', () => {
	delete g.document;
	const { riva, scheduler } = setup();
	const q = query({ id: 'q', refetchEvery: '30s', fetch: async () => 1 });
	const off = riva.subscribe(q, () => {});
	expect(scheduler.pending).toBe(0);
	off();
});

test('setData over an in-flight fetch notifies once and resolves its waiters with the data', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', fetch: m.fetch });
	const p = q.ensure(riva);
	const seen: string[] = [];
	const off = riva.subscribe(q, (s) => seen.push(s.status));
	const before = seen.length;
	q.setData(riva, undefined, 'set');
	expect(seen.length - before).toBe(1);
	expect(await p).toBe('set');
	expect(riva.get(q)).toMatchObject({
		status: 'success',
		data: 'set',
		isFetching: false,
	});
	off();
});

test('a refetch after an error clears the error and keeps the data', async () => {
	const { riva } = setup();
	const m = manual<void, string>();
	const q = query({ id: 'q', retry: 0, fetch: m.fetch });
	const p = q.ensure(riva);
	m.calls[0]?.reject(new Error('boom'));
	await expect(p).rejects.toThrow('boom');
	q.setData(riva, undefined, 'old');
	riva.get(q);
	const err = riva.get(q);
	expect(err.error).toBeUndefined();
	const q2 = query({ id: 'q2', retry: 0, fetch: m.fetch });
	const p2 = q2.ensure(riva);
	m.calls[1]?.reject(new Error('bad'));
	await expect(p2).rejects.toThrow('bad');
	const r = q2.ensure(riva).catch(() => {});
	expect(riva.get(q2)).toMatchObject({
		status: 'pending',
		isFetching: true,
		error: undefined,
	});
	m.calls[2]?.resolve('ok');
	await r;
});

test('queries.missing pins a fetch only for stored data the cache cannot read', async () => {
	const hole = { on: false };
	const cache: CachePolicy<unknown> = {
		write: (_c, data) => data,
		read: (_c, stored) => (hole.on ? undefined : stored),
		release: () => {},
	};
	const riva = createRiva();
	let calls = 0;
	const def = query<{ id: string }, string | undefined>({
		id: 'qc/missing',
		retry: 0,
		cache,
		staleTime: 60_000,
		fetch: async ({ id }) => {
			calls++;
			return id === 'none' ? undefined : `v${calls}`;
		},
	});
	// A fresh entry whose data is truly undefined: nothing to refetch.
	riva.queries.missing(def, { id: 'none' });
	await flush();
	expect(calls).toBe(0);
	// Stale but readable: left alone.
	await def.ensure(riva, { id: 'a' });
	def.invalidate(riva, { id: 'a' });
	riva.queries.missing(def, { id: 'a' });
	await flush();
	expect(calls).toBe(1);
	// Unreadable: a fetch starts.
	await def.ensure(riva, { id: 'b' });
	expect(calls).toBe(2);
	hole.on = true;
	riva.queries.missing(def, { id: 'b' });
	await flush();
	expect(calls).toBe(3);
});
