import type { RivaClient } from '../client';
import type { Readable } from '../computed';
import type { Signal } from '../signal';
import type { Action } from './types';

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

/** The browser keeps the newest of two stores with one name (hot reload); the server refuses. */
export const inBrowser = (): boolean => typeof document !== 'undefined';

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
