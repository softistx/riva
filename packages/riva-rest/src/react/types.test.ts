import { expect, expectTypeOf, test } from 'bun:test';
import type { Query } from '@softistx/riva';
import type { ResourceState } from '@softistx/riva/resource';
import type {
	MutationResult,
	SuspendedState,
} from '@softistx/riva-react/resource';
import type { ClientOperations, Invoice } from '../../test/fixtures';
import type { RestMutateCall } from '../calls';
import type { RestInput } from '../simple';
import type { MutationResult as ReexportedMutationResult } from './index';
import type {
	UntypedUseRest,
	UntypedUseRestMutation,
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
		MutationResult<
			{ json: { number: string; total: number } },
			Invoice,
			RestMutateCall
		>
	>();
});

test('types: a wrong path or input is inferred from the arguments and refused', () => {
	const never = () => {
		// @ts-expect-error not a path of the spec
		useRest('/nope');
		// @ts-expect-error the method is gone
		useRest('get', '/invoices/{id}');
		// @ts-expect-error the method is gone
		useRest('get', '/health');
		// @ts-expect-error `id` is a string
		useRest('/invoices/{id}', { param: { id: 1 } });
		// @ts-expect-error the error is on the wrong param, not on the whole call
		useRest('/invoices/{id}', { param: { nope: '1' } });
		// @ts-expect-error `enabled` is not available with `suspense`
		useRest('/health', undefined, { suspense: true, enabled: false });
		// @ts-expect-error not a path of the spec
		useRestMutation('post', '/nope');
		const { run: create } = useRestMutation('post', '/invoices');
		// @ts-expect-error `total` is a number
		create({ json: { number: 'X', total: 'ten' } });
		// @ts-expect-error `json` is required
		create({});
		void create({ json: { number: 'X', total: 1 } });
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

test('types: the untyped form refuses a leading method', () => {
	const untyped = {} as UntypedUseRest;
	const never = () => {
		// @ts-expect-error the method is gone
		untyped('get', '/x');
	};
	expect(typeof never).toBe('function');
});

test('the untyped mutation hook defaults its input to RestInput', () => {
	const untyped = {} as UntypedUseRestMutation;
	const hook = () => untyped('post', '/x');
	expectTypeOf(hook).returns.toEqualTypeOf<
		MutationResult<RestInput, unknown, RestMutateCall>
	>();
});

test('MutationResult is re-exported from the react entry', () => {
	expectTypeOf<ReexportedMutationResult<{ a: 1 }, 2>>().toEqualTypeOf<
		MutationResult<{ a: 1 }, 2>
	>();
});
