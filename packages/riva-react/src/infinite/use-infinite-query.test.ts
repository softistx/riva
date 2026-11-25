import { expect, test } from 'bun:test';
import { infinite } from '@softistx/riva/infinite';
import { act } from 'react';
import { flush, h, mount, newRiva } from '../../test/render';
import { type InfiniteResult, useInfiniteQuery } from './use-infinite-query';

type Item = { id: string };
const feed = (total: number, id: string) =>
	infinite<
		{ school: string; after?: string; before?: string },
		{
			list: {
				edges: { node: Item; cursor: string }[];
				pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean };
			};
		},
		Item
	>({
		id,
		retry: 0,
		staleTime: '1m',
		fetch: async (v) => {
			const from = v.after === undefined ? 0 : Number(v.after) + 1;
			const to = Math.min(from + 2, total);
			const edges = [];
			for (let i = from; i < to; i++)
				edges.push({ node: { id: String(i) }, cursor: String(i) });
			return {
				list: {
					edges,
					pageInfo: {
						hasNextPage: to < total,
						hasPreviousPage: from > 0,
						startCursor: edges[0]?.cursor ?? null,
						endCursor: edges.at(-1)?.cursor ?? null,
					},
				},
			};
		},
		connection: (p) => p.list,
	});

test('loads the first page, then fetchNext appends the next', async () => {
	const def = feed(5, 'uiq/feed');
	let box!: InfiniteResult<unknown, Item>;
	function C() {
		const q = useInfiniteQuery(def, { school: 's' });
		box = q as unknown as InfiniteResult<unknown, Item>;
		return h(
			'p',
			null,
			`${q.data?.nodes.map((n) => n.id).join(',') ?? '-'}|${q.hasNext}|${q.isFetchingNext}`,
		);
	}
	const m = await mount(h(C), newRiva());
	await flush();
	expect(m.text()).toBe('0,1|true|false');
	await flush(() => void box.fetchNext());
	expect(m.text()).toBe('0,1,2,3|true|false');
	await flush(() => void box.fetchNext());
	expect(m.text()).toBe('0,1,2,3,4|false|false');
	await flush(() => void box.refetch());
	expect(m.text()).toBe('0,1,2,3,4|false|false');
	await m.unmount();
});

test('the actions keep their identity, and enabled: false stays idle', async () => {
	const def = feed(3, 'uiq/idle');
	const seen: Array<InfiniteResult<unknown, Item>> = [];
	function C({ on }: { on: boolean }) {
		const q = useInfiniteQuery(def, { school: 's' }, { enabled: on });
		seen.push(q as unknown as InfiniteResult<unknown, Item>);
		return h('p', null, q.status);
	}
	const m = await mount(h(C, { on: false }), newRiva());
	await flush();
	expect(m.text()).toBe('idle');
	await act(async () => {});
	expect(new Set(seen.map((s) => s.fetchNext)).size).toBe(1);
	await m.unmount();
});
