import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	buildIndex,
	INDEX_PATH,
	isFresh,
	isIndexed,
	packageFolders,
} from './plugin-index';

test('the committed index is what the generator answers now', () => {
	expect(isFresh()).toBe(true);
});

test('every package has an entry, with its entry points and docs', () => {
	const index = buildIndex();
	for (const folder of packageFolders())
		expect(index).toContain(`## @softistx/${folder}`);
	expect(index).toContain('`@softistx/riva/store`');
	expect(index).toContain(
		'node_modules/@softistx/riva/docs/troubleshooting.md',
	);
});

test('a guide with `index: false` in its frontmatter is skipped', () => {
	const dir = mkdtempSync(join(tmpdir(), 'riva-index-'));
	const hidden = join(dir, 'hidden.md');
	const shown = join(dir, 'shown.md');
	writeFileSync(hidden, '---\nindex: false\n---\n# Hidden\n');
	writeFileSync(shown, '# Shown\n');
	expect(isIndexed(hidden)).toBe(false);
	expect(isIndexed(shown)).toBe(true);
});

test('a missing or edited index is stale', () => {
	const root = mkdtempSync(join(tmpdir(), 'riva-root-'));
	mkdirSync(join(root, 'packages', 'a', 'docs'), { recursive: true });
	writeFileSync(
		join(root, 'packages', 'a', 'package.json'),
		JSON.stringify({
			name: '@softistx/a',
			description: 'd',
			exports: { '.': {} },
		}),
	);
	writeFileSync(join(root, 'packages', 'a', 'docs', 'README.md'), '# A docs\n');
	expect(isFresh(root)).toBe(false);
	mkdirSync(join(root, INDEX_PATH, '..'), { recursive: true });
	writeFileSync(join(root, INDEX_PATH), buildIndex(root));
	expect(isFresh(root)).toBe(true);
	writeFileSync(join(root, INDEX_PATH), `${buildIndex(root)}x`);
	expect(isFresh(root)).toBe(false);
});
