import { type Query, type Riva, stableKey } from '@softistx/riva';

// Held on the riva's slots: a request's pending fetches die with its riva.
const SLOT = {};

const noop = () => {};

/**
 * How long a resource's watcher outlives its first data: the mounted
 * component's own subscription takes over by then. (A query's watcher is
 * handed off on the event instead, see `handoff`.)
 */
export const HANDOFF_MS = 1000;

// The pending watchers per riva and key: released when the entry gains another observer.
const WATCHERS = {};

type Watchers = Map<string, () => void>;

/**
 * Releases the watcher a suspended render left on `key`: the entry has
 * another observer now, so closing the watcher no longer closes a kept stream
 * (a live query). Call it after subscribing. A no-op when none is pending.
 * @internal
 */
export function handoff(riva: Riva, key: string): void {
	(riva.slots.get(WATCHERS) as Watchers | undefined)?.get(key)?.();
}

/**
 * What a suspended render waits on: `settled`, or in a browser the first
 * data a streaming fetch publishes (`watch` listens to the entry), so a
 * query with `@defer` renders its fast fields while the rest is coming. The
 * server waits for `settled`: it renders and dehydrates whole data. Every
 * outcome resolves; the next render reads the state.
 *
 * Once resolved, the watcher stays as the entry's only observer until the
 * suspended component mounts and observes (`handoff`): releasing it sooner
 * would close a kept stream and make the mount open a second one. A
 * component that never mounts releases it through `hold`. A rejected fetch
 * releases it at once.
 * @internal
 */
export function untilData(
	settled: PromiseLike<unknown>,
	watch: (listener: (state: { data: unknown }) => void) => () => void,
	hold: (release: () => void) => void = noop,
): Promise<void> {
	let off = noop;
	let failed = false;
	return new Promise<void>((resolve) => {
		settled.then(resolve as () => void, () => {
			failed = true;
			resolve();
		});
		if ('document' in globalThis)
			off = watch((state) => state.data !== undefined && resolve());
	}).then(() => {
		if (off === noop) return;
		// A failed fetch keeps nothing: its polling and refetches stop now.
		if (failed) return off();
		let done = false;
		hold(() => {
			if (done) return;
			done = true;
			off();
		});
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
		promise = untilData(
			settled,
			(listener) => riva.subscribe(def, vars, listener),
			(release) => keep(riva, def, key, vars, release),
		).then(done, done);
		entries.set(key, promise);
	}
	return promise;
}

/**
 * The longest a watcher outlives its first data with nobody mounted. It
 * mirrors the core's default `gcTime` for a browser entry, and also caps a
 * longer or infinite one so a component that never mounts cannot leak it.
 */
const CAP_MS = 300_000;

/**
 * Holds a resolved watcher's release until `handoff`, or until the cap (the
 * entry's `gcTime`, at most `CAP_MS`) passes with nobody mounted, on riva's
 * scheduler. The handoff releases one tick later, so a StrictMode cleanup
 * and resubscribe (observers dipping to the watcher alone) never closes the
 * stream. When the entry already has an observer besides the watcher (a
 * mounted component that suspended again), it is handed off right away.
 */
function keep(
	riva: Riva,
	// biome-ignore lint/suspicious/noExplicitAny: any query definition
	def: Query<any, any, any>,
	key: string,
	vars: unknown,
	release: () => void,
): void {
	let held = riva.slots.get(WATCHERS) as Watchers | undefined;
	if (!held) {
		held = new Map();
		riva.slots.set(WATCHERS, held);
	}
	const watchers = held;
	const { sched } = riva.queries;
	let timer: unknown;
	const free = () => {
		sched.clearTimeout(timer);
		if (watchers.get(key) === soon) watchers.delete(key);
		release();
	};
	const soon = () => void sched.setTimeout(free, 0);
	watchers.get(key)?.();
	watchers.set(key, soon);
	timer = sched.setTimeout(
		free,
		Math.min(def.options.gcTime ?? CAP_MS, CAP_MS),
	);
	if (
		(riva.queries.ctx.entries.get(stableKey(def.id, vars))?.observers ?? 0) > 1
	)
		soon();
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
