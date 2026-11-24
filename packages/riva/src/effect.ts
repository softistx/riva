import type { Unsubscribe } from './atom';
import type { EffectFn } from './client';
import { isBrowser, resolve } from './scope';

const noop = () => {};

/** Re-runs `fn` when what it read changes. Client-only: a no-op on the server. */
export const effect = (fn: EffectFn): Unsubscribe =>
	isBrowser() ? resolve().effect(fn) : noop;
