import { expect, expectTypeOf, test } from 'bun:test';
import type { Query } from '@softistx/riva';
import type { ResourceState } from '@softistx/riva/resource';
import type {
	MutationHook,
	SuspendedState,
} from '@softistx/riva-react/resource';
import type { ClientOperations, Invoice } from '../../test/fixtures';
import type { MutateCall } from '../calls';
import type {
	UntypedUseRest,
	UseRest,
	UseRestMutation,
	UseRestOptions,
} from './types';
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
		// @ts-expect-error the error is on the wrong param, not on the whole call
		useRest('get', '/invoices/{id}', { param: { nope: '1' } });
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

test('useRest over a definition: typed untyped-form and suspense', () => {
	const def = {} as Query<{ param: { id: string } }, Invoice>;
	const untyped = {} as UntypedUseRest;
	const read = () => untyped(def, { param: { id: '1' } });
	expectTypeOf(read).returns.toEqualTypeOf<ResourceState<Invoice>>();
	const wrong = () =>
		// @ts-expect-error the input is required by the definition
		untyped(def);
	expectTypeOf(wrong).toBeFunction();
	const suspended = () =>
		untyped(def, { param: { id: '1' } }, { suspense: true });
	expectTypeOf(suspended).returns.toEqualTypeOf<SuspendedState<Invoice>>();
	const typed = {} as UseRest;
	const typedSuspended = () =>
		typed(def, { param: { id: '1' } }, { suspense: true });
	expectTypeOf(typedSuspended).returns.toEqualTypeOf<SuspendedState<Invoice>>();
});
