import { resolve } from './scope';

export type Listener<T> = (value: T) => void;
export type Unsubscribe = () => void;

export interface SignalOptions<T> {
	name?: string;
	equals?: (a: T, b: T) => boolean;
	/** Whether the value travels in an SSR snapshot (it needs a `name` too). Default false: opt in. */
	ssr?: boolean;
}

/** A stateless definition: it holds no value, a `Riva` does. */
export interface Signal<T> {
	readonly kind: 'signal';
	readonly initial: T;
	readonly name: string | undefined;
	readonly ssr: boolean;
	equals(a: T, b: T): boolean;
	/** Reads through the ambient riva. */
	get(): T;
	set(value: NoInfer<T> | ((prev: T) => T)): void;
	subscribe(listener: Listener<T>): Unsubscribe;
}

export function signal<T>(initial: T, opts: SignalOptions<T> = {}): Signal<T> {
	const def: Signal<T> = Object.freeze({
		kind: 'signal',
		initial,
		name: opts.name,
		ssr: opts.ssr ?? false,
		equals: opts.equals ?? Object.is,
		get: () => resolve().get(def),
		set: (value: T | ((prev: T) => T)) => resolve().set(def, value),
		subscribe: (listener: Listener<T>) => resolve().subscribe(def, listener),
	});
	return def;
}
