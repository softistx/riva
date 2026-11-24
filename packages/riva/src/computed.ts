import type { Atom, Listener, Unsubscribe } from './atom';
import { resolve } from './scope';

export type Readable<T> = Atom<T> | Computed<T>;
export type Getter = <U>(def: Readable<U>) => U;

export interface ComputedOptions<T> {
	name?: string;
	equals?: (a: T, b: T) => boolean;
}

/** A stateless derived value: lazy, cached per client, tracked dynamically. */
export interface Computed<T> {
	readonly kind: 'computed';
	readonly name: string | undefined;
	fn(get: Getter): T;
	equals(a: T, b: T): boolean;
	get(): T;
	subscribe(listener: Listener<T>): Unsubscribe;
}

export function computed<T>(
	fn: (get: Getter) => T,
	opts: ComputedOptions<T> = {},
): Computed<T> {
	const def: Computed<T> = Object.freeze({
		kind: 'computed',
		name: opts.name,
		fn,
		equals: opts.equals ?? Object.is,
		get: () => resolve().get(def),
		subscribe: (listener: Listener<T>) => resolve().subscribe(def, listener),
	});
	return def;
}
