import { afterEach, describe, expect, expectTypeOf, test } from 'bun:test';
import {
	concat,
	EMPTY,
	Observable,
	of,
	ReplaySubject,
	Subject,
	startWith,
	throwError,
} from 'rxjs';
import { fakeEnv, settle } from '../../test/ssr';
import type { Query, QueryState } from '../query';
import { dehydrate, hydrate } from '../ssr';
import { liveQuery } from './live-query';

const g = globalThis as { document?: unknown };
const saved = g.document;
afterEach(() => {
	if (saved === undefined) delete g.document;
	else g.document = saved;
});
const browser = () => {
	g.document = {};
};
const server = () => {
	delete g.document;
};

/** One subject per subscription, so a test sees what is open. */
function feed(id: string, extra: { gcTime?: number } = {}) {
	const open: Subject<number>[] = [];
	let subscribed = 0;
	let unsubscribed = 0;
	const q = liveQuery<{ room: string }, number>({
		id,
		retry: 0,
		...extra,
		observe: () =>
			new Observable<number>((sub) => {
				subscribed++;
				const s = new Subject<number>();
				open.push(s);
				const inner = s.subscribe(sub);
				return () => {
					unsubscribed++;
					inner.unsubscribe();
				};
			}),
	});
	return {
		q,
		last: () => open[open.length - 1] as Subject<number>,
		count: () => ({ subscribed, unsubscribed }),
	};
}

const room = { room: 'a' };

describe('liveQuery on the server', () => {
	test('ensure resolves at the first value, then unsubscribes', async () => {
		server();
		const { q, last, count } = feed('srv');
		const riva = fakeEnv().riva();
		const p = q.ensure(riva, room);
		last().next(7);
		expect(await p).toBe(7);
		expect(count()).toEqual({ subscribed: 1, unsubscribed: 1 });
		last().next(8);
		expect(riva.get(q, room).data).toBe(7);
	});

	test('a synchronous burst keeps the last value', async () => {
		server();
		const q = liveQuery<void, number>({
			id: 'burst',
			observe: () =>
				new Observable<number>((s) => {
					s.next(1);
					s.next(2);
				}),
		});
		const riva = fakeEnv().riva();
		await q.ensure(riva);
		expect(riva.get(q).data).toBe(2);
	});

	test('the snapshot carries the value and the browser resubscribes', async () => {
		server();
		const s = feed('snap');
		const env = fakeEnv();
		const srv = env.riva();
		const p = s.q.ensure(srv, room);
		s.last().next(1);
		await p;
		const snap = JSON.parse(JSON.stringify(dehydrate(srv)));

		browser();
		const b = feed('snap');
		const client = env.riva();
		hydrate(client, snap);
		expect(client.get(b.q, room).data).toBe(1);
		expect(b.count().subscribed).toBe(0);
		const seen: Array<number | undefined> = [];
		const off = client.subscribe(b.q, room, (st) => seen.push(st.data));
		await settle();
		expect(b.count().subscribed).toBe(1);
		b.last().next(2);
		await settle();
		expect(client.get(b.q, room).data).toBe(2);
		off();
	});

	test('a silent stream stops with the request signal', async () => {
		server();
		const { q, count } = feed('silent');
		const riva = fakeEnv().riva();
		const ctl = new AbortController();
		const p = q.ensure(riva, room, { signal: ctl.signal });
		await settle();
		expect(count()).toEqual({ subscribed: 1, unsubscribed: 0 });
		ctl.abort();
		await expect(p).rejects.toThrow();
		expect(count()).toEqual({ subscribed: 1, unsubscribed: 1 });
	});

	test('an error before the first value rejects', async () => {
		server();
		const q = liveQuery<void, number>({
			id: 'early',
			observe: () => new Observable<number>((s) => s.error(new Error('down'))),
		});
		await expect(q.ensure(fakeEnv().riva())).rejects.toThrow('down');
	});
});

describe('liveQuery in a browser', () => {
	test('the first observer subscribes, the last release unsubscribes', async () => {
		browser();
		const { q, last, count } = feed('life');
		const riva = fakeEnv().riva();
		const a = riva.subscribe(q, room, () => {});
		await settle();
		const b = riva.subscribe(q, room, () => {});
		await settle();
		expect(count()).toEqual({ subscribed: 1, unsubscribed: 0 });
		expect(riva.get(q, room).status).toBe('loading');
		last().next(1);
		await settle();
		last().next(2);
		expect(riva.get(q, room)).toMatchObject({ status: 'success', data: 2 });
		a();
		expect(count().unsubscribed).toBe(0);
		b();
		expect(count().unsubscribed).toBe(1);
		last().next(3);
		expect(riva.get(q, room).data).toBe(2);
	});

	test('the data is kept for gcTime, a new observer resubscribes', async () => {
		browser();
		const env = fakeEnv();
		const { q, last, count } = feed('gc', { gcTime: 1000 });
		const riva = env.riva();
		const off = riva.subscribe(q, room, () => {});
		await settle();
		last().next(5);
		await settle();
		off();
		env.sched.advance(500);
		expect(riva.get(q, room).data).toBe(5);
		const again = riva.subscribe(q, room, () => {});
		await settle();
		expect(count().subscribed).toBe(2);
		expect(riva.get(q, room)).toMatchObject({ data: 5, isFetching: true });
		last().next(6);
		await settle();
		expect(riva.get(q, room)).toMatchObject({ data: 6, isFetching: false });
		again();
		env.sched.advance(1500);
		expect(riva.get(q, room).data).toBeUndefined();
	});

	test('an error sets the error state and keeps the data; refetch resubscribes', async () => {
		browser();
		const { q, last, count } = feed('err');
		const riva = fakeEnv().riva();
		const off = riva.subscribe(q, room, () => {});
		await settle();
		last().next(1);
		await settle();
		last().error(new Error('lost'));
		expect(riva.get(q, room)).toMatchObject({ status: 'error', data: 1 });
		q.invalidate(riva, room);
		await settle();
		expect(count().subscribed).toBe(2);
		last().next(2);
		await settle();
		expect(riva.get(q, room)).toMatchObject({
			status: 'success',
			data: 2,
			error: undefined,
		});
		off();
	});

	test('complete keeps the last value and does not reconnect', async () => {
		browser();
		const { q, last, count } = feed('done');
		const riva = fakeEnv().riva();
		const off = riva.subscribe(q, room, () => {});
		await settle();
		last().next(9);
		await settle();
		last().complete();
		await settle();
		expect(riva.get(q, room)).toMatchObject({ status: 'success', data: 9 });
		expect(count().subscribed).toBe(1);
		off();
	});

	test('a restart in the tick of the first value closes the first stream', async () => {
		browser();
		const { q, last, count } = feed('same-tick');
		const riva = fakeEnv().riva();
		const off = riva.subscribe(q, room, () => {});
		await settle();
		last().next(1);
		q.invalidate(riva, room);
		await settle();
		last().next(2);
		await settle();
		off();
		const { subscribed, unsubscribed } = count();
		expect(subscribed).toBeGreaterThan(1);
		expect(unsubscribed).toBe(subscribed);
	});

	test('a stream that completes before a value rejects', async () => {
		browser();
		const q = liveQuery<void, number>({
			id: 'empty',
			retry: 0,
			observe: () => EMPTY,
		});
		const riva = fakeEnv().riva();
		await expect(q.ensure(riva)).rejects.toThrow('completed without a value');
		expect(riva.get(q).status).toBe('error');
	});

	test('ensure with no observer closes the stream at once; a later observer subscribes', async () => {
		browser();
		const { q, last, count } = feed('unobserved');
		const riva = fakeEnv().riva();
		const p = q.ensure(riva, room);
		last().next(3);
		expect(await p).toBe(3);
		await settle();
		expect(count()).toEqual({ subscribed: 1, unsubscribed: 1 });
		const off = riva.subscribe(q, room, () => {});
		await settle();
		expect(count().subscribed).toBe(2);
		off();
	});

	test('a burst on subscribe (startWith) settles after it and later values arrive', async () => {
		browser();
		const s = new Subject<number>();
		const q = liveQuery<void, number>({
			id: 'burst/start',
			retry: 0,
			observe: () => s.pipe(startWith(1, 2)),
		});
		const riva = fakeEnv().riva();
		const off = riva.subscribe(q, undefined, () => {});
		await settle();
		expect(riva.get(q)).toMatchObject({ status: 'success', data: 2 });
		s.next(3);
		expect(riva.get(q).data).toBe(3);
		expect(s.observed).toBe(true);
		off();
		expect(s.observed).toBe(false);
	});

	test('an unobserved ensure over a ReplaySubject closes it; an observer resubscribes', async () => {
		browser();
		const r = new ReplaySubject<number>(2);
		r.next(1);
		r.next(2);
		let subscribed = 0;
		const q = liveQuery<void, number>({
			id: 'burst/replay',
			retry: 0,
			observe: () =>
				new Observable<number>((sub) => {
					subscribed++;
					return r.subscribe(sub);
				}),
		});
		const riva = fakeEnv().riva();
		expect(await q.ensure(riva)).toBe(2);
		await settle();
		expect(r.observed).toBe(false);
		const off = riva.subscribe(q, undefined, () => {});
		await settle();
		expect(subscribed).toBe(2);
		expect(r.observed).toBe(true);
		r.next(5);
		expect(riva.get(q).data).toBe(5);
		off();
	});

	test('values then a synchronous error resolve with the last value, then show the error', async () => {
		browser();
		let unsubscribed = 0;
		const err = new Error('boom');
		const q = liveQuery<void, number>({
			id: 'burst/error',
			retry: 0,
			observe: () =>
				new Observable<number>((sub) => {
					const inner = concat(
						of(1, 2),
						throwError(() => err),
					).subscribe(sub);
					return () => {
						unsubscribed++;
						inner.unsubscribe();
					};
				}),
		});
		const riva = fakeEnv().riva();
		expect(await q.ensure(riva)).toBe(2);
		await settle();
		expect(riva.get(q)).toMatchObject({ status: 'error', data: 2, error: err });
		expect(unsubscribed).toBe(1);
	});

	test('values then a synchronous error on the server resolve with the value and stay a success', async () => {
		server();
		const q = liveQuery<void, number>({
			id: 'burst/error-server',
			retry: 0,
			observe: () =>
				concat(
					of(1, 2),
					throwError(() => new Error('boom')),
				),
		});
		const riva = fakeEnv().riva();
		expect(await q.ensure(riva)).toBe(2);
		await settle();
		expect(riva.get(q)).toMatchObject({ status: 'success', data: 2 });
	});

	test('one stream per variables', async () => {
		browser();
		const { q, count } = feed('keys');
		const riva = fakeEnv().riva();
		const a = riva.subscribe(q, { room: 'a' }, () => {});
		const b = riva.subscribe(q, { room: 'b' }, () => {});
		await settle();
		expect(count().subscribed).toBe(2);
		a();
		b();
	});
});

describe('liveQuery types', () => {
	test('the data is typed from the Observable', () => {
		const q = liveQuery<{ id: number }, string>({
			id: 'types',
			observe: () => new Observable<string>(),
		});
		expectTypeOf(q).toEqualTypeOf<Query<{ id: number }, string>>();
		expectTypeOf(q.ensure).returns.toEqualTypeOf<Promise<string>>();
		const s = fakeEnv().riva().get(q, { id: 1 });
		expectTypeOf(s).toEqualTypeOf<QueryState<string>>();
	});

	test('observe must return an Observable of the data', () => {
		liveQuery<void, number>({
			id: 'bad',
			// @ts-expect-error a stream of strings is not a stream of numbers
			observe: () => new Observable<string>(),
		});
	});
});
