import { resolve } from './scope';

export type Listener<T> = (value: T) => void;
export type Unsubscribe = () => void;

export interface AtomOptions<T> {
	name?: string;
	equals?: (a: T, b: T) => boolean;
	/** Whether the value travels in the SSR payload. Default true. */
	ssr?: boolean;
}

/** A stateless definition: it holds no value, a `RivaClient` does. */
export interface Atom<T> {
	readonly kind: 'atom';
	readonly initial: T;
	readonly name: string | undefined;
	readonly ssr: boolean;
	equals(a: T, b: T): boolean;
	/** Reads through the ambient client. */
	get(): T;
	set(value: NoInfer<T> | ((prev: T) => T)): void;
	subscribe(listener: Listener<T>): Unsubscribe;
}

export function atom<T>(initial: T, opts: AtomOptions<T> = {}): Atom<T> {
	const def: Atom<T> = Object.freeze({
		kind: 'atom',
		initial,
		name: opts.name,
		ssr: opts.ssr ?? true,
		equals: opts.equals ?? Object.is,
		get: () => resolve().get(def),
		set: (value: T | ((prev: T) => T)) => resolve().set(def, value),
		subscribe: (listener: Listener<T>) => resolve().subscribe(def, listener),
	});
	return def;
}
