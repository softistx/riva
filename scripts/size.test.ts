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
