import { afterEach, describe, expect, test } from 'bun:test';
import { fakeEnv, settle } from '../test/ssr';
import { query } from './query';
import { dehydrate, hydrate } from './ssr';

const g = globalThis as { document?: unknown };
const saved = g.document;
afterEach(() => {
	if (saved === undefined) delete g.document;
	else g.document = saved;
});

/** A query whose fetch keeps a "stream" open through `ctx.keep`, like a live query. */
function kept(id: string, gcTime?: number) {
	const stops: number[] = [];
	let opened = 0;
	const q = query<void, number>({
		id,
		retry: 0,
		staleTime: Infinity,
		live: true,
		...(gcTime !== undefined && { gcTime }),
		fetch: async (_v, { keep }) => {
			const n = ++opened;
			keep?.(() => {
				stops.push(n);
				return true;
			});
			return n;
		},
	});
	return { q, stops };
}

describe('a fetch that keeps something open', () => {
	test('the last release closes it and leaves the entry stale', async () => {
		g.document = {};
		const { q, stops } = kept('keep/release');
		const riva = fakeEnv().riva();
		const a = riva.subscribe(q, undefined, () => {});
		await settle();
		const b = riva.subscribe(q, undefined, () => {});
		a();
		expect(stops).toEqual([]);
		b();
		expect(stops).toEqual([1]);
		const again = riva.subscribe(q, undefined, () => {});
		await settle();
		expect(riva.get(q).data).toBe(2);
		again();
	});

	test('a refetch closes the previous one when it starts', async () => {
		g.document = {};
		const { q, stops } = kept('keep/refetch');
		const riva = fakeEnv().riva();
		const off = riva.subscribe(q, undefined, () => {});
		await settle();
		q.invalidate(riva);
		await settle();
		expect(stops).toEqual([1]);
		off();
		expect(stops).toEqual([1, 2]);
	});

	test('an entry collected without observers closes it', async () => {
		g.document = {};
		const env = fakeEnv();
		const { q, stops } = kept('keep/gc', 1000);
		const riva = env.riva();
		q.prefetch(riva);
		await settle();
		// no observer: closed right after the fetch, the entry is stale
		expect(stops).toEqual([1]);
		env.sched.advance(2000);
		expect(riva.get(q).data).toBeUndefined();
		expect(stops.length).toBeGreaterThanOrEqual(1);
	});
});

describe('hydrating a live entry', () => {
	test('marks it invalidated, so its first observer fetches', async () => {
		delete g.document;
		const env = fakeEnv();
		const { q } = kept('keep/hydrate');
		const srv = env.riva();
		await q.ensure(srv);
		const snap = JSON.parse(JSON.stringify(dehydrate(srv)));
		g.document = {};
		const { q: bq, stops } = kept('keep/hydrate');
		const client = env.riva();
		hydrate(client, snap);
		expect(client.get(bq).data).toBe(1);
		const off = client.subscribe(bq, undefined, () => {});
		await settle();
		expect(client.get(bq).data).toBe(1);
		off();
		expect(stops).toEqual([1]);
	});
});
