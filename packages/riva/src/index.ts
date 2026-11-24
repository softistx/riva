export const VERSION = '0.0.0';

export {
	type Atom,
	type AtomOptions,
	atom,
	type Listener,
	type Unsubscribe,
} from './atom';
export { batch, untracked } from './batch';
export { type ClientOptions, createRivaClient, RivaClient } from './client';
export {
	type Computed,
	type ComputedOptions,
	computed,
	type Getter,
	type Readable,
} from './computed';
export { type Duration, toMs } from './duration';
export { effect } from './effect';
export type { ClientEvents, Scheduler } from './env';
export {
	RivaAbortError,
	RivaError,
	RivaHttpError,
	RivaNetworkError,
	RivaRequestError,
	RivaScopeError,
} from './errors';
export { stableKey } from './key';
export {
	type EnsureOptions,
	type FetchContext,
	type Query,
	type QueryOptions,
	type QueryState,
	type QueryStatus,
	query,
	type VarsArgs,
} from './query';
export { setDefaultClient } from './scope';
