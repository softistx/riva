import type { RivaClient } from '../client';
import { computed, type Getter, type Readable } from '../computed';
import { resolve } from '../scope';
import { type Signal, signal } from '../signal';
import { freeze, put, RESERVED, type StoreDef, writable } from './def';
import { instance } from './instance';
import type { Action, Reserved, Store, StoreOptions } from './types';
import { refuse, view } from './view';

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
	const seen = new Set(RESERVED);
	for (const k of [
		...Object.keys(state),
		...Object.keys(derived),
		...Object.keys(actions),
	]) {
		if (seen.has(k))
			refuse(
				`Store "${name}": the key "${k}" is taken (a state, computed or action key, or one of ${RESERVED.join(', ')}).`,
			);
		seen.add(k);
	}

	const sigs: Record<string, Signal<unknown>> = {};
	for (const k in state)
		sigs[k] = signal(freeze(state[k]), {
			name: `${name}.${k}`,
			ssr,
			equals: (a, b) =>
				writable()
					? Object.is(a, b)
					: refuse(
							`Store "${name}": "${k}" is written outside an action. Write it in an action of the store.`,
						),
		});
	const comps: Record<string, Readable<unknown>> = {};
	for (const k in derived)
		comps[k] = computed(
			(get) =>
				derived[k]?.(
					view(
						state,
						(key) => get(sigs[key] as Signal<unknown>),
						(key) =>
							refuse(`Store "${name}": a computed cannot write "${key}".`),
					),
					get,
				),
			{ name: `${name}.${k}` },
		);
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
		reset: (client: RivaClient = resolve()) => {
			instance(data, client);
			client.batch(() => {
				for (const k in sigs) {
					const sig = sigs[k] as Signal<unknown>;
					put(client, sig, sig.initial);
				}
			});
		},
		bind: (client: RivaClient) => instance(data, client),
		...ambient,
		...members,
	}) as unknown as Store<N, S, C, A>;
}
