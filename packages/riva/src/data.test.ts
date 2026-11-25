import { expect, expectTypeOf, test } from 'bun:test';
import type { DataOperation, DataSource } from './data';

test('a data source finds an operation by id', () => {
	const op: DataOperation = { kind: 'query', run: async () => 1 };
	const source: DataSource = { find: (id) => (id === 'a' ? op : undefined) };
	expect(source.find('a')).toBe(op);
	expectTypeOf(source.find).returns.toEqualTypeOf<DataOperation | undefined>();
});
