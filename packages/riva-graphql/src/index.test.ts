import { expect, test } from 'bun:test';
import * as api from './index';

test('the main entry exports the transport and the definitions, nothing from the subpaths', () => {
	expect(Object.keys(api).sort()).toEqual([
		'VERSION',
		'graphqlClientTransport',
		'mutation',
		'operationOf',
		'provideGraphQL',
		'query',
		'toRivaError',
	]);
});

test('the runtime entries never import graphql, the codegen or the graphql-client at runtime', async () => {
	const files = [...new Bun.Glob('**/*.ts').scanSync('src')].filter(
		(f) => !f.endsWith('.test.ts') && !f.startsWith('codegen/'),
	);
	expect(files.length).toBeGreaterThan(5);
	for (const f of files) {
		const code = await Bun.file(`src/${f}`).text();
		const imports = [
			...code.matchAll(/^import (?!type )[^;]*from '([^']+)'/gm),
		];
		for (const [, from] of imports)
			expect(from).not.toMatch(
				/^(graphql|@graphql-codegen|@softistx\/graphql-client)/,
			);
	}
});
