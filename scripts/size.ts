/**
 * Size budgets (spec section 6): each entry is built minified with every
 * import external, gzipped, and must stay within its limit in bytes.
 * Add riva-react (core + react, 9216 B) in its slice.
 */
export interface Budget {
	name: string;
	/** Built entry, relative to the repository root. */
	entry: string;
	limit: number;
}

export const budgets: Budget[] = [
	{ name: '@softistx/riva', entry: 'packages/riva/dist/index.js', limit: 6144 },
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

export async function measure(entry: string): Promise<number> {
	const out = await Bun.build({
		entrypoints: [entry],
		minify: true,
		external: ['*'],
		target: 'browser',
	});
	if (!out.success || !out.outputs[0])
		throw new Error(`Cannot build ${entry}: ${out.logs.join('\n')}`);
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
