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

test('the core and subpath rows: 6144 B and 8448 B, the second under the 9216 B core + react cap', () => {
	const row = budgets.find((b) => b.name === '@softistx/riva + entities');
	expect(row?.limit).toBe(8448);
	expect(row?.entry).toEqual([
		'packages/riva/dist/index.js',
		'packages/riva/dist/entities/index.js',
	]);
	expect(row?.limit).toBeLessThanOrEqual(9216);
});

test('the infinite, ssr and all-subpaths rows: 8192 B, 7424 B and 12288 B', () => {
	const inf = budgets.find((b) => b.name === '@softistx/riva + infinite');
	expect(inf?.limit).toBe(8192);
	expect(inf?.entry).toEqual([
		'packages/riva/dist/index.js',
		'packages/riva/dist/infinite/index.js',
	]);
	const all = budgets.find((b) => b.name === '@softistx/riva + all subpaths');
	expect(all?.limit).toBe(12288);
	expect(all?.entry).toHaveLength(5);
	const ssr = budgets.find((b) => b.name === '@softistx/riva + ssr');
	expect(ssr?.limit).toBe(7424);
	expect(ssr?.entry).toEqual([
		'packages/riva/dist/index.js',
		'packages/riva/dist/ssr/index.js',
	]);
});

test('the riva-react rows: core + react within the 9216 B cap, every entry within 12288 B', () => {
	const main = budgets.find((b) => b.name === '@softistx/riva + riva-react');
	expect(main?.limit).toBe(9216);
	expect(main?.entry).toEqual([
		'packages/riva/dist/index.js',
		'packages/riva-react/dist/index.js',
	]);
	const all = budgets.find(
		(b) => b.name === '@softistx/riva + riva-react, all subpaths',
	);
	expect(all?.limit).toBe(12288);
	expect(all?.entry).toHaveLength(8);
});

test('the riva-graphql row: core + graphql main within 8192 B', () => {
	const row = budgets.find((b) => b.name === '@softistx/riva + riva-graphql');
	expect(row?.limit).toBe(8192);
	expect(row?.entry).toEqual([
		'packages/riva/dist/index.js',
		'packages/riva-graphql/dist/index.js',
	]);
});

test('the riva-rest row: core + rest main within 8192 B', () => {
	const row = budgets.find((b) => b.name === '@softistx/riva + riva-rest');
	expect(row?.limit).toBe(8192);
	expect(row?.entry).toEqual([
		'packages/riva/dist/index.js',
		'packages/riva-rest/dist/index.js',
	]);
});

test('the riva-react-router row: 11264 B, react-router external, main row unchanged', () => {
	const row = budgets.find(
		(b) => b.name === '@softistx/riva + riva-react + riva-react-router',
	);
	expect(row?.limit).toBe(11264);
	expect(row?.entry).toEqual([
		'packages/riva/dist/index.js',
		'packages/riva/dist/ssr/index.js',
		'packages/riva-react/dist/index.js',
		'packages/riva-react-router/dist/index.js',
	]);
	expect(budgets.find((b) => b.name === '@softistx/riva')?.limit).toBe(6144);
});
