import { isBrowser } from './scope';

/** Time source, injectable so tests and non-browser hosts control timers. */
export interface Scheduler {
	now(): number;
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

/** Window events that trigger refetches; each returns its own unsubscribe. */
export interface ClientEvents {
	onFocus(cb: () => void): () => void;
	onReconnect(cb: () => void): () => void;
}

export const defaultScheduler: Scheduler = {
	now: () => Date.now(),
	setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
	clearTimeout: (h) => globalThis.clearTimeout(h as number),
};

// The slice of the DOM the defaults use, typed locally: the core has no DOM lib.
interface Target {
	addEventListener(type: string, cb: () => void): void;
	removeEventListener(type: string, cb: () => void): void;
}
interface Host extends Target {
	document?: Target & { visibilityState?: string };
}

const noop = () => {};

/** Browser listeners (visibilitychange when visible, focus, online); nothing on the server. */
export const defaultEvents: ClientEvents = {
	onFocus(cb) {
		if (!isBrowser()) return noop;
		const host = globalThis as unknown as Host;
		const doc = host.document;
		const onVisible = () => {
			if (doc?.visibilityState === 'visible') cb();
		};
		doc?.addEventListener?.('visibilitychange', onVisible);
		host.addEventListener?.('focus', cb);
		return () => {
			doc?.removeEventListener?.('visibilitychange', onVisible);
			host.removeEventListener?.('focus', cb);
		};
	},
	onReconnect(cb) {
		if (!isBrowser()) return noop;
		const host = globalThis as unknown as Host;
		host.addEventListener?.('online', cb);
		return () => host.removeEventListener?.('online', cb);
	},
};
