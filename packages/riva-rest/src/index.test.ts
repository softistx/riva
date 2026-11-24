import { expect, test } from 'bun:test';
import * as api from './index';

test('the main entry exports the transport and the definitions, nothing from the subpaths', () => {
	expect(Object.keys(api).sort()).toEqual([
		'VERSION',
		'httpyzTransport',
		'mutation',
		'operationOf',
		'provideRest',
		'query',
		'toRivaError',
	]);
});

test('the runtime entries never import httpyz, openapi-httpyz or the core entities at runtime', async () => {
	const files = [...new Bun.Glob('**/*.ts').scanSync('src')].filter(
		(f) => !f.endsWith('.test.ts') && !f.startsWith('entities/'),
	);
	expect(files.length).toBeGreaterThan(5);
	for (const f of files) {
		const code = await Bun.file(`src/${f}`).text();
		const imports = [
			...code.matchAll(/^import (?!type )[^;]*from '([^']+)'/gm),
		];
		for (const [, from] of imports)
			expect(from).not.toMatch(
				/^(@softistx\/httpyz|@softistx\/openapi-httpyz|@softistx\/riva\/entities)/,
			);
	}
});
