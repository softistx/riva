import { expectTypeOf, test } from 'bun:test';
import { computed, mutation, query, signal } from '@softistx/riva';
import { infinite } from '@softistx/riva/infinite';
import { useFragment } from './entities';
import { useMutation, useQuery, useSignal, useValue } from './index';
import { useInfiniteQuery } from './infinite';

// Type tests only: nothing here runs (hooks need a render).
const types = () => {
	const count = signal(0);
	const double = computed((get) => get(count) * 2);
	expectTypeOf(useSignal(count)).toEqualTypeOf<
		[value: number, set: (value: number | ((prev: number) => number)) => void]
	>();
	expectTypeOf(useValue(double)).toEqualTypeOf<number>();
	expectTypeOf(useValue(count)).toEqualTypeOf<number>();

	const users = query<{ school: string }, string[]>({
		id: 't/users',
		fetch: async () => [],
	});
	const plain = query<void, number>({ id: 't/plain', fetch: async () => 1 });

	const q = useQuery(users, { school: 's' });
	expectTypeOf(q.data).toEqualTypeOf<string[] | undefined>();
	expectTypeOf(q.refetch).toEqualTypeOf<() => Promise<void>>();
	useQuery(plain);
	useQuery(plain, undefined, { enabled: false });
	// @ts-expect-error variables are required and typed
	useQuery(users);
	// @ts-expect-error wrong variables
	useQuery(users, { school: 1 });

	const s = useQuery(users, { school: 's' }, { suspense: true });
	expectTypeOf(s.data).toEqualTypeOf<string[]>();
	expectTypeOf(s.status).toEqualTypeOf<
		'idle' | 'loading' | 'success' | 'error'
	>();
	const sp = useQuery(plain, undefined, { suspense: true });
	expectTypeOf(sp.data).toEqualTypeOf<number>();

	const rename = mutation<{ id: string }, boolean>({
		id: 't/rename',
		mutate: async () => true,
	});
	const m = useMutation(rename);
	expectTypeOf(m.mutate({ id: '1' })).toEqualTypeOf<Promise<boolean>>();
	expectTypeOf(m.data).toEqualTypeOf<boolean | undefined>();
	// @ts-expect-error wrong variables
	m.mutate({ id: 1 });

	const feed = infinite<
		{ school: string; after?: string },
		{
			c: {
				edges: { node: { id: string } }[];
				pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean };
			};
		},
		{ id: string }
	>({
		id: 't/feed',
		fetch: async () => ({
			c: {
				edges: [],
				pageInfo: { hasNextPage: false, hasPreviousPage: false },
			},
		}),
		connection: (p) => p.c,
	});
	const f = useInfiniteQuery(feed, { school: 's' });
	expectTypeOf(f.data?.nodes).toEqualTypeOf<{ id: string }[] | undefined>();
	expectTypeOf(f.hasNext).toEqualTypeOf<boolean>();
	expectTypeOf(f.fetchNext).toEqualTypeOf<() => Promise<void>>();
	// @ts-expect-error variables are required
	useInfiniteQuery(feed);

	expectTypeOf(useFragment<{ id: string }>('Patient:1')).toEqualTypeOf<
		{ id: string } | undefined
	>();
};

test('type inference holds', () => {
	expectTypeOf(types).toBeFunction();
});
