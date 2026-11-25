import { expect, expectTypeOf, test } from 'bun:test';
import { createRiva, RivaScopeError } from '@softistx/riva';
import { buildAllowlist } from '../codegen/index';
import { type GraphQLTransport, provideGraphQL } from '../transport';
import { allowlist } from './index';

const persisted = {
	'sha256:a':
		'query Patients($school: ID!) { patients(school: $school) { id } }',
	'sha256:b': 'mutation RenamePatient($id: ID!) { rename(id: $id) { id } }',
};

function setup() {
	const seen: Array<{
		id: string;
		name: string;
		kind: string;
		text: string;
		vars: unknown;
		signal: AbortSignal;
	}> = [];
	const transport: GraphQLTransport = {
		async execute(operation, vars, { signal }) {
			seen.push({
				id: operation.id,
				name: operation.name,
				kind: operation.kind,
				text: operation.document.definitions[0]?.kind ?? '',
				vars,
				signal,
			});
			return { echoed: vars } as never;
		},
	};
	const riva = createRiva();
	provideGraphQL(riva, transport);
	return { seen, riva };
}

test('finds an operation by its persisted hash and runs it through the riva transport', async () => {
	const { seen, riva } = setup();
	const source = allowlist(buildAllowlist(persisted));
	const op = source.find('sha256:a');
	expect(op?.kind).toBe('query');
	const signal = new AbortController().signal;
	expect(await op?.run(riva, { school: 's' }, signal)).toEqual({
		echoed: { school: 's' },
	});
	expect(seen).toEqual([
		{
			id: 'sha256:a',
			name: 'Patients',
			kind: 'query',
			text: 'OperationDefinition',
			vars: { school: 's' },
			signal,
		},
	]);
});

test('finds an operation by its name when the manifest is keyed by names', async () => {
	const { seen, riva } = setup();
	const source = allowlist(buildAllowlist(persisted, { ids: 'name' }));
	expect(source.find('sha256:a')).toBeUndefined();
	const op = source.find('RenamePatient');
	expect(op?.kind).toBe('mutation');
	await op?.run(riva, { id: '1' }, new AbortController().signal);
	expect(seen[0]?.id).toBe('RenamePatient');
	expect(seen[0]?.kind).toBe('mutation');
});

test('an id the manifest does not hold is unknown, prototype keys included', () => {
	const source = allowlist(buildAllowlist(persisted));
	for (const id of ['Patients', '', 'toString', '__proto__', 'constructor'])
		expect(source.find(id)).toBeUndefined();
});

test('the same operation object answers each find of an id', () => {
	const source = allowlist(buildAllowlist(persisted));
	expect(source.find('sha256:a')).toBe(source.find('sha256:a'));
});

test('a riva with no transport throws the scope error of provideGraphQL', async () => {
	const source = allowlist(buildAllowlist(persisted));
	await expect(
		Promise.resolve().then(() =>
			source
				.find('sha256:a')
				?.run(createRiva(), {}, new AbortController().signal),
		),
	).rejects.toBeInstanceOf(RivaScopeError);
});

test('refuses a manifest entry of an unknown kind and says to rerun the codegen', () => {
	const bad = {
		'sha256:x': {
			id: 'sha256:x',
			name: 'X',
			kind: 'subscription',
			document: 'x',
		},
	};
	expect(() => allowlist(bad)).toThrow(
		expect.objectContaining({
			code: 'RIVA_DEFINITION',
			message: expect.stringContaining('rerun the codegen'),
		}),
	);
});

test('accepts a JSON-shaped manifest, kind widened to string', () => {
	expectTypeOf<
		Record<string, { id: string; name: string; kind: string; document: string }>
	>().toExtend<Parameters<typeof allowlist>[0]>();
	expectTypeOf<ReturnType<typeof buildAllowlist>>().toExtend<
		Parameters<typeof allowlist>[0]
	>();
});
