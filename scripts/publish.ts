#!/usr/bin/env bun
/**
 * Publishes every public package whose current version is not on npmjs yet,
 * in dependency order, with `bun publish`. Idempotent: a version already on
 * the registry is skipped, so a re-run resumes.
 *
 * npmjs only (owner rule), from CI only: `.github/workflows/publish.yml` runs
 * it on a tag with `$NPM_TOKEN` (the org secret). Run `bun run build` first.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

const ROOT = join(import.meta.dir, '..');
const REGISTRY = 'https://registry.npmjs.org/';

export interface Pkg {
	name: string;
	version: string;
	dir: string;
	deps: Set<string>;
}

export async function readPackages(root = ROOT): Promise<Pkg[]> {
	const pkgs: Pkg[] = [];
	for (const entry of await readdir(join(root, 'packages'))) {
		const dir = join(root, 'packages', entry);
		const file = Bun.file(join(dir, 'package.json'));
		if (!(await file.exists())) continue;
		const json = await file.json();
		if (json.private) continue;
		const deps = new Set<string>([
			...Object.keys(json.dependencies ?? {}),
			...Object.keys(json.peerDependencies ?? {}),
		]);
		pkgs.push({ name: json.name, version: json.version, dir, deps });
	}
	return pkgs;
}

/** Dependencies first, so a consumer is never on the registry before its dependency. */
export function inDependencyOrder(pkgs: Pkg[]): Pkg[] {
	const byName = new Map(pkgs.map((p) => [p.name, p]));
	const done = new Set<string>();
	const order: Pkg[] = [];
	while (order.length < pkgs.length) {
		const ready = pkgs.filter(
			(p) =>
				!done.has(p.name) &&
				[...p.deps].every((d) => !byName.has(d) || done.has(d)),
		);
		if (ready.length === 0) {
			const stuck = pkgs.filter((p) => !done.has(p.name)).map((p) => p.name);
			throw new Error(`dependency cycle between: ${stuck.join(', ')}`);
		}
		for (const p of ready) {
			order.push(p);
			done.add(p.name);
		}
	}
	return order;
}

async function onNpm(name: string, version: string): Promise<boolean> {
	const res = await fetch(`${REGISTRY}${name.replace('/', '%2f')}/${version}`);
	if (res.status === 404) return false;
	if (!res.ok)
		throw new Error(`${name}@${version}: registry said ${res.status}`);
	return true;
}

async function main(): Promise<void> {
	let published = 0;
	let upToDate = 0;
	for (const pkg of inDependencyOrder(await readPackages())) {
		if (await onNpm(pkg.name, pkg.version)) {
			upToDate++;
			continue;
		}
		await $`bun publish --access public --registry ${REGISTRY}`.cwd(pkg.dir);
		console.log(`New tag: ${pkg.name}@${pkg.version}`);
		published++;
	}
	console.log(`\n${published} published, ${upToDate} already up to date.`);
}

if (import.meta.main) {
	await main();
}
