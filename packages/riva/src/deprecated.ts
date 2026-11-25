import { createRiva, Riva, type RivaOptions } from './client';
import type { RivaEvents } from './env';
import { setDefaultRiva } from './scope';

/** @deprecated Use `Riva`. Removed in the next minor. */
export const RivaClient = Riva;
/** @deprecated Use `Riva`. Removed in the next minor. */
export type RivaClient = Riva;

/** @deprecated Use `createRiva`. Removed in the next minor. */
export const createRivaClient = createRiva;

/** @deprecated Use `setDefaultRiva`. Removed in the next minor. */
export const setDefaultClient = setDefaultRiva;

/** @deprecated Use `RivaOptions`. Removed in the next minor. */
export type ClientOptions = RivaOptions;

/** @deprecated Use `RivaEvents`. Removed in the next minor. */
export type ClientEvents = RivaEvents;
