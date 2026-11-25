import { expectTypeOf, test } from 'bun:test';
import { store } from '@softistx/riva/store';
import { useStore } from './index';

// Type tests only: nothing here runs (hooks need a render).
const types = () => {
	const Books = store({
		name: 't-books',
		state: { items: [] as string[], filter: '' },
		computed: { total: (s) => s.items.length },
		actions: {
			add(s, title: string) {
				s.items = [...s.items, title];
			},
			async load(s, id: number) {
				s.filter = String(id);
			},
		},
	});
	const [s, a] = useStore(Books);
	expectTypeOf(s.items).toEqualTypeOf<string[]>();
	expectTypeOf(s.filter).toEqualTypeOf<string>();
	expectTypeOf(s.total).toEqualTypeOf<number>();
	expectTypeOf(a.add).toEqualTypeOf<(title: string) => void>();
	expectTypeOf(a.load).toEqualTypeOf<(id: number) => Promise<void>>();
	// @ts-expect-error the view is read-only
	s.filter = 'x';
	// @ts-expect-error not a key of the store
	s.nope;
};

test('useStore types [s, a] from the store', () => {
	expectTypeOf(types).toBeFunction();
});
