import { expect, expectTypeOf, test } from 'bun:test';
import type { ResourceState } from '@softistx/riva/resource';
import type {
	MutationHook,
	SuspendedState,
} from '@softistx/riva-react/resource';
import type { ClientOperations, Invoice } from '../../test/fixtures';
import type { MutateCall } from '../calls';
import type { UseRest, UseRestMutation, UseRestOptions } from './types';

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
