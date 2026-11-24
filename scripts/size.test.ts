import { expect, test } from 'bun:test';
import { type Budget, budgets, check } from './size';

const list: Budget[] = [
	{ name: 'a', entry: 'a.js', limit: 100 },
	{ name: 'b', entry: 'b.js', limit: 200 },
];

test('within budget, at the limit, and over', () => {
	const r = check(list, { a: 100, b: 201 });
	expect(r.map((x) => x.ok)).toEqual([true, false]);
	expect(r[1]?.size).toBe(201);
});

test('a missing measurement fails', () => {
	expect(check(list, { a: 1 })[1]?.ok).toBe(false);
});

test('the core budget is 6144 B', () => {
	expect(budgets.find((b) => b.name === '@softistx/riva')?.limit).toBe(6144);
});

test('the core and subpath rows: 6144 B and 8192 B, the second under the 9216 B core + react cap', () => {
	const row = budgets.find((b) => b.name === '@softistx/riva + entities');
	expect(row?.limit).toBe(8192);
	expect(row?.entry).toEqual([
		'packages/riva/dist/index.js',
		'packages/riva/dist/entities/index.js',
	]);
	expect(row?.limit).toBeLessThanOrEqual(9216);
});

test('the infinite and all-subpaths rows: 8192 B and 10240 B', () => {
	const inf = budgets.find((b) => b.name === '@softistx/riva + infinite');
	expect(inf?.limit).toBe(8192);
	expect(inf?.entry).toEqual([
		'packages/riva/dist/index.js',
		'packages/riva/dist/infinite/index.js',
	]);
	const all = budgets.find((b) => b.name === '@softistx/riva + all subpaths');
	expect(all?.limit).toBe(10240);
	expect(all?.entry).toHaveLength(3);
});
