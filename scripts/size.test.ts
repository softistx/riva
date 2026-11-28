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

const row = (name: string) => {
	const found = budgets.find((b) => b.name === name);
	if (!found) throw new Error(`no budget row named ${name}`);
	return found;
};

const core = 'packages/riva/dist/index.js';

test('every row has a unique name, entries and a positive limit', () => {
	const names = budgets.map((b) => b.name);
	expect(new Set(names).size).toBe(names.length);
	for (const b of budgets) {
		expect([b.entry].flat().length).toBeGreaterThan(0);
		expect(b.limit).toBeGreaterThan(0);
		expect(Number.isFinite(b.limit)).toBe(true);
	}
});

test('the core row measures the core entry alone', () => {
	expect(row('@softistx/riva').entry).toBe(core);
});

test.each([
	['@softistx/riva + entities', 'packages/riva/dist/entities/index.js'],
	['@softistx/riva + infinite', 'packages/riva/dist/infinite/index.js'],
	['@softistx/riva + ssr', 'packages/riva/dist/ssr/index.js'],
	['@softistx/riva + riva-react', 'packages/riva-react/dist/index.js'],
	['@softistx/riva + riva-graphql', 'packages/riva-graphql/dist/index.js'],
	['@softistx/riva + riva-rest', 'packages/riva-rest/dist/index.js'],
])('the %s row is the core plus %s', (name, entry) => {
	expect(row(name).entry).toEqual([core, entry]);
});

test('the all-subpaths rows list several entries', () => {
	expect(row('@softistx/riva + all subpaths').entry).toHaveLength(5);
	expect(row('@softistx/riva + riva-react, all subpaths').entry).toHaveLength(
		8,
	);
});

test('the riva-react-router row bundles core, ssr, react and the router adapter', () => {
	expect(row('@softistx/riva + riva-react + riva-react-router').entry).toEqual([
		core,
		'packages/riva/dist/ssr/index.js',
		'packages/riva-react/dist/index.js',
		'packages/riva-react-router/dist/index.js',
	]);
});

test('measure leaves the host and adapter peers external', async () => {
	const src = await Bun.file(new URL('./size.ts', import.meta.url)).text();
	for (const ext of ['react', 'react-router', '@softistx/graphql-client'])
		expect(src).toContain(`'${ext}'`);
});
