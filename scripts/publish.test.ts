import { expect, test } from 'bun:test';
import { inDependencyOrder, type Pkg } from './publish';

const pkg = (name: string, ...deps: string[]): Pkg => ({
	name,
	version: '0.0.0',
	dir: name,
	deps: new Set(deps),
});

test('publishes dependencies first', () => {
	const order = inDependencyOrder([pkg('b', 'a'), pkg('a')]).map((p) => p.name);
	expect(order).toEqual(['a', 'b']);
});

test('refuses a cycle', () => {
	expect(() => inDependencyOrder([pkg('a', 'b'), pkg('b', 'a')])).toThrow(
		'cycle',
	);
});
