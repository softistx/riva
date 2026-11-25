import type { Riva } from '../client';
import type { Getter } from '../computed';
import { resolve } from '../scope';
import type { Signal } from '../signal';
import { checkKeys, computeds, put, type StoreDef, stateSignals } from './def';
import { instance } from './instance';
import type { Action, Reserved, Store, StoreOptions } from './types';

/**
 * A domain store: its state, computeds and actions in one definition. Every
 * state key is a signal named `<name>.<key>` and every computed a riva
 * computed, both read as definitions; only actions write.
 */
export function store<
	const N extends string,
	S extends Record<string, unknown>,
	C = Record<never, never>,
	A = Record<never, never>,
>(
	options: StoreOptions<S, C, A> & { name: N } & Reserved<S, C, A>,
): Store<N, S, C, A> {
	const { name, ssr = false } = options;
	const state = options.state as Record<string, unknown>;
	const derived = (options.computed ?? {}) as Record<
		string,
		(s: unknown, get: Getter) => unknown
	>;
	// biome-ignore lint/suspicious/noExplicitAny: any state and computed shape
	const actions = (options.actions ?? {}) as Record<string, Action<any, any>>;
	checkKeys(name, [
		...Object.keys(state),
		...Object.keys(derived),
		...Object.keys(actions),
	]);
	const sigs = stateSignals(name, state, ssr);
	const comps = computeds(name, state, derived, sigs);
	const members = { ...sigs, ...comps };
	const data: StoreDef = { name, sigs, members, actions };

	const ambient: Record<string, (...args: unknown[]) => unknown> = {};
	for (const k in actions)
		ambient[k] = (...args) =>
			(instance(data, resolve())[1][k] as (...a: unknown[]) => unknown)(
				...args,
			);

	return Object.freeze({
		kind: 'store',
		name,
		reset: (riva: Riva = resolve()) => {
			instance(data, riva);
			riva.batch(() => {
				for (const k in sigs) {
					const sig = sigs[k] as Signal<unknown>;
					put(riva, sig, sig.initial);
				}
			});
		},
		bind: (riva: Riva) => instance(data, riva),
		...ambient,
		...members,
	}) as unknown as Store<N, S, C, A>;
}
