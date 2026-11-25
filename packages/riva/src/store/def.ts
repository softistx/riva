import type { RivaClient } from '../client';
import type { Readable } from '../computed';
import { computed, type Getter } from '../computed';
import { type Signal, signal } from '../signal';
import type { Action } from './types';
import { refuse, view } from './view';

/** The data of one store definition, shared by its action runner and its per-client instance. */
export interface StoreDef {
	readonly name: string;
	/** The state keys' signals, named `<name>.<key>`. */
	readonly sigs: Record<string, Signal<unknown>>;
	/** The signals and computeds, by key. */
	readonly members: Record<string, Readable<unknown>>;
	// biome-ignore lint/suspicious/noExplicitAny: any state and computed shape
	readonly actions: Record<string, Action<any, any>>;
}

/** Keys a store cannot use: its own members, and `then` (a store is never thenable). */
export const RESERVED = ['kind', 'name', 'reset', 'bind', 'then'];

// Off in a browser bundle that has no `process`.
let dev = false;
try {
	dev = process.env.NODE_ENV !== 'production';
} catch {}

/** Dev only: a stored value cannot be mutated in place, so a nested write throws. */
export const freeze = <T>(v: T): T => {
	if (dev && v && typeof v === 'object' && !Object.isFrozen(v)) {
		Object.freeze(v);
		for (const x of Object.values(v)) freeze(x);
	}
	return v;
};

/**
 * Raised for the length of one synchronous write made through an action's `s`
 * or `reset`: the state signals' `equals` refuses every other write. Safe as
 * module state: it is only raised under a batch (depth > 0, which an action
 * past an `await` takes before its first write), so no listener runs while it
 * is up and a write a listener makes is refused like any other.
 */
let writing = 0;

/** Whether a write is allowed now: the guard the state signals' `equals` asks. */
export const writable = (): boolean => writing > 0;

/** Writes one state key through its signal, with the guard raised. */
export const put = (
	client: RivaClient,
	sig: Signal<unknown>,
	value: unknown,
): void => {
	writing++;
	try {
		client.set(sig, () => value);
	} finally {
		writing--;
	}
};

/** Refuses a state, computed or action key that is reserved or used twice. */
export const checkKeys = (name: string, keys: readonly string[]): void => {
	const seen = new Set(RESERVED);
	for (const k of keys) {
		if (seen.has(k))
			refuse(
				`Store "${name}": the key "${k}" is taken (a state, computed or action key, or one of ${RESERVED.join(', ')}).`,
			);
		seen.add(k);
	}
};

/** The state keys' signals, named `<name>.<key>`, guarded against writes outside an action. */
export const stateSignals = (
	name: string,
	state: Record<string, unknown>,
	ssr: boolean,
): Record<string, Signal<unknown>> => {
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
	return sigs;
};

/** The store's computeds, each reading the state through a read-only view. */
export const computeds = (
	name: string,
	state: Record<string, unknown>,
	derived: Record<string, (s: unknown, get: Getter) => unknown>,
	sigs: Record<string, Signal<unknown>>,
): Record<string, Readable<unknown>> => {
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
	return comps;
};
