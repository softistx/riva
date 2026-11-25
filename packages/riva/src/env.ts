import { isBrowser } from './scope';

/** Time source, injectable so tests and non-browser hosts control timers. */
export interface Scheduler {
	now(): number;
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

/** Window events that trigger refetches; each returns its own unsubscribe. */
export interface RivaEvents {
	onFocus(cb: () => void): () => void;
	onReconnect(cb: () => void): () => void;
}

export const noop = (): void => {};

/** One unsubscribe for two. */
export const both = (a: () => void, b: () => void) => (): void => {
	a();
	b();
};

export const defaultScheduler: Scheduler = {
	now: Date.now,
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (h) => clearTimeout(h as number),
};

// The slice of the DOM the defaults use, typed locally: the core has no DOM lib.
interface Target {
	addEventListener?(type: string, cb: () => void): void;
	removeEventListener?(type: string, cb: () => void): void;
	visibilityState?: string;
}

/** Listens on `target`; a no-op unsubscribe on the server. */
const on = (target: () => Target | undefined, type: string, cb: () => void) => {
	const t = isBrowser() ? target() : undefined;
	t?.addEventListener?.(type, cb);
	return () => t?.removeEventListener?.(type, cb);
};
const host = () => globalThis as Target;
const doc = () => (globalThis as { document?: Target }).document;

/** Browser listeners (visibilitychange when visible, focus, online); nothing on the server. */
export const defaultEvents: RivaEvents = {
	onFocus(cb) {
		const a = on(doc, 'visibilitychange', () => {
			if (doc()?.visibilityState === 'visible') cb();
		});
		const b = on(host, 'focus', cb);
		return both(a, b);
	},
	onReconnect: (cb) => on(host, 'online', cb),
};
