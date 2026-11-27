/* biome-ignore-all lint/style/useNamingConvention: GraphQL's field names */
import '../../test/happydom';
import { expect, expectTypeOf, test } from 'bun:test';
import { createRiva } from '@softistx/riva';
import type { MutationResult } from '@softistx/riva-react/resource';
import {
	fakeTransport,
	RENAME_PATIENT_MUTATION,
	VIEWER_QUERY,
} from '../../test/fixtures';
import { flush, h, mount } from '../../test/render';
import type { GraphQLMutateCall } from '../calls';
import { withGraphQL } from '../simple';
import type { MutationResult as ReexportedMutationResult } from './index';
import { useGraphQL } from './use-graphql';
import { useGraphQLMutation } from './use-graphql-mutation';

test('idle, loading, success, reset; a call invalidates the observed query', async () => {
	let n = 0;
	const t = fakeTransport((c) =>
		c.kind === 'mutation'
			? { renamePatient: { id: '1', name: 'Z' } }
			: { viewer: { id: String(++n) } },
	);
	const riva = createRiva({ graphql: withGraphQL(t) });
	let rename!: {
		status: string;
		reset(): void;
		mutate: (...a: unknown[]) => Promise<unknown>;
	};
	let shown = '';
	function C() {
		rename = useGraphQLMutation(RENAME_PATIENT_MUTATION) as never;
		const v = useGraphQL(VIEWER_QUERY);
		shown = `${rename.status}:${v.data?.viewer.id}`;
		return h('p', null, shown);
	}
	const m = await mount(h(C), riva);
	await flush();
	expect(m.text()).toBe('idle:1');
	let result: unknown;
	await flush(async () => {
		result = await rename.mutate(
			{ id: '1', name: 'Z' },
			{ invalidates: [VIEWER_QUERY] },
		);
	});
	expect(result).toEqual({ renamePatient: { id: '1', name: 'Z' } });
	expect(m.text()).toBe('success:2');
	await flush(() => rename.reset());
	expect(m.text()).toBe('idle:2');
	await m.unmount();
});

test('a failure rejects the call and lands in the state', async () => {
	const riva = createRiva({
		graphql: withGraphQL(
			fakeTransport(() => {
				throw new Error('no');
			}),
		),
	});
	let rename!: (...a: unknown[]) => Promise<unknown>;
	let status = '';
	function C() {
		const r = useGraphQLMutation(RENAME_PATIENT_MUTATION);
		rename = r.mutate as never;
		status = r.status;
		return h('p', null, r.status);
	}
	const m = await mount(h(C), riva);
	await flush(async () => {
		await rename({ id: '1', name: 'Z' }).catch(() => {});
	});
	expect(status).toBe('error');
	await m.unmount();
});

test('types: variables and data come from the document', () => {
	const hook = {} as ReturnType<
		typeof useGraphQLMutation<
			{ renamePatient: { id: string; name: string } },
			{ id: string; name: string }
		>
	>;
	expectTypeOf(hook).toEqualTypeOf<
		MutationResult<
			{ id: string; name: string },
			{ renamePatient: { id: string; name: string } },
			GraphQLMutateCall
		>
	>();
});

test('types: the input is inferred from the document', () => {
	const never = () => {
		const { mutate: rename } = useGraphQLMutation(RENAME_PATIENT_MUTATION);
		// @ts-expect-error `id` must be a string
		rename({ id: 1, name: 'Z' });
		// @ts-expect-error `nom` is not an input of the document
		rename({ id: '1', nom: 'Z' });
		void rename({ id: '1', name: 'Z' });
	};
	expect(typeof never).toBe('function');
});

test('MutationResult is re-exported from the react entry', () => {
	expectTypeOf<ReexportedMutationResult<{ a: 1 }, 2>>().toEqualTypeOf<
		MutationResult<{ a: 1 }, 2>
	>();
});
