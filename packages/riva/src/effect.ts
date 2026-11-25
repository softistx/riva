import type { EffectFn } from './client';
import { noop } from './env';
import { isBrowser, resolve } from './scope';
import type { Unsubscribe } from './signal';

/** Re-runs `fn` when what it read changes. Client-only: a no-op on the server. */
export const effect = (fn: EffectFn): Unsubscribe =>
	isBrowser() ? resolve().effect(fn) : noop;
