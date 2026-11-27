import type { Query, Riva } from '@softistx/riva';

// Held on the riva's slots: a request's pending fetches die with its riva.
const SLOT = {};

const noop = () => {};

/**
 * How long the watcher outlives the first data. It is the entry's only
 * observer until the suspended component mounts and observes; releasing it
 * sooner would close a kept stream (a live query) and make the mount open a
 * second one.
 */
export const HANDOFF_MS = 1000;

/**
 * What a suspended render waits on: `settled`, or in a browser the first
 * data a streaming fetch publishes (`watch` listens to the entry), so a
 * query with `@defer` renders its fast fields while the rest is coming. The
 * server waits for `settled`: it renders and dehydrates whole data. Every
 * outcome resolves; the next render reads the state.
 * @internal
 */
export function untilData(
	settled: PromiseLike<unknown>,
	watch: (listener: (state: { data: unknown }) => void) => () => void,
): Promise<void> {
	let off = noop;
	return new Promise<void>((resolve) => {
		settled.then(resolve as () => void, resolve as () => void);
		if ('document' in globalThis)
			off = watch((state) => state.data !== undefined && resolve());
	}).then(() => {
		if (off !== noop) setTimeout(off, HANDOFF_MS);
	});
}

/**
 * The one promise React waits on for a query entry: the core's `ensure`, held
 * until `untilData`, so every render that suspends gets the same promise. A
 * failure is swallowed here; the next render reads it from the state.
 */
export function suspend(
	riva: Riva,
	// biome-ignore lint/suspicious/noExplicitAny: any query definition
	def: Query<any, any, any>,
	key: string,
	vars: unknown,
): Promise<void> {
	let map = riva.slots.get(SLOT) as Map<string, Promise<void>> | undefined;
	if (!map) {
		map = new Map();
		riva.slots.set(SLOT, map);
	}
	let promise = map.get(key);
	if (!promise) {
		const entries = map;
		const done = () => void entries.delete(key);
		const settled = (def.ensure as (c: Riva, v: unknown) => Promise<unknown>)(
			riva,
			vars,
		);
		promise = untilData(settled, (listener) =>
			riva.subscribe(def, vars, listener),
		).then(done, done);
		entries.set(key, promise);
	}
	return promise;
}

// The errors a suspense hook threw, per riva: false until a later task arms them.
const ERRORS = {};

/**
 * Whether a suspense hook that reads `error` should refetch instead of
 * throwing it. The first read throws it and arms it on a later task, so React's
 * synchronous render retry (dev, StrictMode) throws the same error again; a
 * read of an armed error is a boundary reset, and the caller suspends on a
 * fresh fetch. A new failure is a new error object, so the cycle restarts.
 * The server always throws.
 */
export function retryOnReset(riva: Riva, error: unknown): boolean {
	if (!('document' in globalThis)) return false;
	const seen: Map<unknown, boolean> =
		(riva.slots.get(ERRORS) as Map<unknown, boolean> | undefined) ?? new Map();
	riva.slots.set(ERRORS, seen);
	const armed = seen.get(error);
	if (armed) return seen.delete(error);
	if (armed === undefined) {
		seen.set(error, false);
		setTimeout(() => seen.has(error) && seen.set(error, true), 0);
	}
	return false;
}
