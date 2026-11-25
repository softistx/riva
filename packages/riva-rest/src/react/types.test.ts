import { expect, expectTypeOf, test } from 'bun:test';
import type { ResourceState } from '@softistx/riva/resource';
import type {
	MutationHook,
	SuspendedState,
} from '@softistx/riva-react/resource';
import type { ClientOperations, Invoice } from '../../test/fixtures';
import type { MutateCall } from '../calls';
import type { UseRest, UseRestMutation, UseRestOptions } from './types';
import { useRest } from './use-rest';
import { useRestMutation } from './use-rest-mutation';

// What an application writes once to type the hooks by its spec.
declare module './types' {
	interface Register {
		operations: ClientOperations;
		decoded: false;
	}
}

test('Register types useRest by the spec', () => {
	const useRest = {} as UseRest;
	expectTypeOf(useRest<'/invoices/{id}'>).toBeFunction();
	const state = {} as ReturnType<typeof useRest<'/invoices/{id}'>>;
	expectTypeOf(state).toEqualTypeOf<ResourceState<Invoice>>();
	const suspended = {} as ReturnType<typeof useRest<'/health'>>;
	expectTypeOf(suspended).toEqualTypeOf<ResourceState<{ ok: boolean }>>();
	expectTypeOf<SuspendedState<Invoice>['data']>().toEqualTypeOf<Invoice>();
	expectTypeOf<UseRestOptions['suspense']>().toEqualTypeOf<
		boolean | undefined
	>();
	expect(true).toBe(true);
});

test('Register types useRestMutation by the spec', () => {
	const useRestMutation = {} as UseRestMutation;
	const hook = {} as ReturnType<typeof useRestMutation<'post', '/invoices'>>;
	expectTypeOf(hook).toEqualTypeOf<
		MutationHook<
			{ json: { number: string; total: number } },
			Invoice,
			MutateCall
		>
	>();
});

test('types: a wrong path or input is inferred from the arguments and refused', () => {
	const never = () => {
		// @ts-expect-error not a path of the spec
		useRest('get', '/nope');
		// @ts-expect-error `id` is a string
		useRest('get', '/invoices/{id}', { param: { id: 1 } });
		// @ts-expect-error `enabled` is not available with `suspense`
		useRest('get', '/health', undefined, { suspense: true, enabled: false });
		// @ts-expect-error not a path of the spec
		useRestMutation('post', '/nope');
		const create = useRestMutation('post', '/invoices');
		// @ts-expect-error `total` is a number
		create({ json: { number: 'X', total: 'ten' } });
		// @ts-expect-error `json` is required
		create({});
	};
	expect(typeof never).toBe('function');
});
