import type { EffectFn } from './client';
import { isBrowser, resolve } from './scope';
import type { Unsubscribe } from './signal';

const noop = () => {};

/** Re-runs `fn` when what it read changes. Client-only: a no-op on the server. */
export const effect = (fn: EffectFn): Unsubscribe =>
	isBrowser() ? resolve().effect(fn) : noop;
