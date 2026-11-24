/**
 * Size budgets (spec section 6): each entry is built minified, gzipped, and
 * must stay within its limit in bytes. Relative imports are bundled (the build
 * splits shared code into chunks), packages stay external. A combined row
 * bundles a virtual entry that imports the main entry and the opt-in
 * subpaths, so what they share is counted once.
 * Grow `@softistx/riva + subpaths` as subpaths land (hard cap: core + react
 * 9216 B); add riva-react in its slice.
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
		limit: 8192,
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
		packages: 'external',
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
