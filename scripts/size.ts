/**
 * Size budgets (spec section 6): each entry is built minified, gzipped, and
 * must stay within its limit in bytes. Relative imports are bundled (the build
 * splits shared code into chunks), and so are the workspace's packages;
 * `react` stays external. A combined row bundles a virtual entry that imports
 * the main entry and the opt-in subpaths, so what they share is counted once.
 * The riva-react rows bundle `@softistx/riva` as the real core (resolved to
 * packages/riva/dist) with `react` left external, so core + react is measured
 * against its hard cap of 9216 B. The riva-graphql row leaves
 * `@softistx/graphql-client` and `graphql` external; the riva-rest row leaves
 * `@softistx/httpyz` and `@softistx/openapi-httpyz` external; the riva-react-router
 * row leaves `react-router` external and has none for its `/server` subpath;
 * the riva-graphql/bff and riva-rest/bff rows count the browser's side of `/_data` (the `/server` subpaths run on the server).
 */
export interface Budget {
	name: string;
	/** Built entry, relative to the repository root, or the entries a virtual one imports. */
	entry: string | string[];
	limit: number;
}

export const budgets: Budget[] = [
	{ name: '@softistx/riva', entry: 'packages/riva/dist/index.js', limit: 6144 },
	{
		name: '@softistx/riva + entities',
		entry: [
			'packages/riva/dist/index.js',
			'packages/riva/dist/entities/index.js',
		],
		limit: 8448,
	},
	{
		name: '@softistx/riva + infinite',
		entry: [
			'packages/riva/dist/index.js',
			'packages/riva/dist/infinite/index.js',
		],
		limit: 8192,
	},
	{
		name: '@softistx/riva + ssr',
		entry: ['packages/riva/dist/index.js', 'packages/riva/dist/ssr/index.js'],
		limit: 7680,
	},
	{
		name: '@softistx/riva + store',
		entry: ['packages/riva/dist/index.js', 'packages/riva/dist/store/index.js'],
		limit: 7680,
	},
	{
		name: '@softistx/riva + resource',
		entry: [
			'packages/riva/dist/index.js',
			'packages/riva/dist/resource/index.js',
		],
		limit: 7680,
	},
	{
		name: '@softistx/riva + all subpaths',
		entry: [
			'packages/riva/dist/index.js',
			'packages/riva/dist/entities/index.js',
			'packages/riva/dist/infinite/index.js',
			'packages/riva/dist/ssr/index.js',
			'packages/riva/dist/store/index.js',
		],
		limit: 12288,
	},
	{
		name: '@softistx/riva + riva-react',
		entry: ['packages/riva/dist/index.js', 'packages/riva-react/dist/index.js'],
		limit: 9216,
	},
	{
		name: '@softistx/riva + riva-react + store',
		entry: [
			'packages/riva/dist/index.js',
			'packages/riva/dist/store/index.js',
			'packages/riva-react/dist/index.js',
			'packages/riva-react/dist/store/index.js',
		],
		limit: 10240,
	},
	{
		name: '@softistx/riva + riva-react, all subpaths',
		entry: [
			'packages/riva/dist/index.js',
			'packages/riva/dist/entities/index.js',
			'packages/riva/dist/infinite/index.js',
			'packages/riva-react/dist/index.js',
			'packages/riva-react/dist/infinite/index.js',
			'packages/riva-react/dist/entities/index.js',
			'packages/riva/dist/store/index.js',
			'packages/riva-react/dist/store/index.js',
		],
		limit: 12800,
	},
	{
		name: '@softistx/riva + riva-graphql',
		entry: [
			'packages/riva/dist/index.js',
			'packages/riva-graphql/dist/index.js',
		],
		limit: 9472,
	},
	{
		name: '@softistx/riva + riva-graphql + cache',
		entry: [
			'packages/riva/dist/index.js',
			'packages/riva/dist/entities/index.js',
			'packages/riva-graphql/dist/index.js',
			'packages/riva-graphql/dist/cache/index.js',
		],
		limit: 13824,
	},
	{
		name: '@softistx/riva + riva-react + riva-react-router',
		entry: [
			'packages/riva/dist/index.js',
			'packages/riva/dist/ssr/index.js',
			'packages/riva-react/dist/index.js',
			'packages/riva-react-router/dist/index.js',
		],
		limit: 11264,
	},
	{
		name: '@softistx/riva + data',
		entry: ['packages/riva/dist/index.js', 'packages/riva/dist/data/index.js'],
		limit: 7168,
	},
	{
		name: '@softistx/riva + riva-graphql/bff',
		entry: [
			'packages/riva/dist/index.js',
			'packages/riva/dist/ssr/index.js',
			'packages/riva-graphql/dist/index.js',
			'packages/riva-graphql/dist/bff/index.js',
		],
		limit: 11008,
	},
	{
		name: '@softistx/riva + riva-rest',
		entry: ['packages/riva/dist/index.js', 'packages/riva-rest/dist/index.js'],
		limit: 9472,
	},
	{
		name: '@softistx/riva + riva-rest/bff',
		entry: [
			'packages/riva/dist/index.js',
			'packages/riva/dist/ssr/index.js',
			'packages/riva-rest/dist/index.js',
			'packages/riva-rest/dist/bff/index.js',
		],
		limit: 11264,
	},
];

export interface Result extends Budget {
	size: number;
	ok: boolean;
}

/** Pure check: which measured sizes are within their budget. */
export const check = (
	list: Budget[],
	sizes: Record<string, number>,
): Result[] =>
	list.map((b) => {
		const size = sizes[b.name] ?? Number.POSITIVE_INFINITY;
		return { ...b, size, ok: size <= b.limit };
	});

/** Gzipped size of an entry, or of a virtual entry re-exporting several. */
export async function measure(entry: string | string[]): Promise<number> {
	const files = [entry].flat();
	const virtual = files.length > 1;
	const out = await Bun.build({
		entrypoints: virtual ? ['virtual:budget'] : files,
		minify: true,
		// A package's own dependencies are bundled (the workspace's `@softistx/riva`
		// is the core under test); the host's `react` and the peers an adapter
		// wraps (`@softistx/graphql-client`, `graphql`) are not ours to count.
		external: [
			'react',
			'react-dom',
			'react/*',
			'react-dom/*',
			'@softistx/graphql-client',
			'graphql',
			'@softistx/httpyz',
			'@softistx/openapi-httpyz',
			'react-router',
			'react-router/*',
			'node:async_hooks',
		],
		target: 'browser',
		plugins: virtual
			? [
					{
						name: 'budget',
						setup(build) {
							build.onResolve({ filter: /^virtual:budget$/ }, (a) => ({
								path: a.path,
								namespace: 'budget',
							}));
							build.onLoad({ filter: /.*/, namespace: 'budget' }, () => ({
								contents: files
									.map(
										(f, i) =>
											`export * as m${i} from ${JSON.stringify(`${process.cwd()}/${f}`)};`,
									)
									.join('\n'),
								loader: 'js',
							}));
						},
					},
				]
			: [],
	});
	if (!out.success || !out.outputs[0])
		throw new Error(`Cannot build ${files.join(', ')}: ${out.logs.join('\n')}`);
	return Bun.gzipSync(new Uint8Array(await out.outputs[0].arrayBuffer()))
		.length;
}

if (import.meta.main) {
	const sizes: Record<string, number> = {};
	for (const b of budgets) sizes[b.name] = await measure(b.entry);
	const results = check(budgets, sizes);
	for (const r of results)
		console.log(
			`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}: ${r.size} B (limit ${r.limit} B)`,
		);
	if (results.some((r) => !r.ok)) process.exit(1);
}
