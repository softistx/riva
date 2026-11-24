export const VERSION = '0.0.0';

export {
	type Atom,
	type AtomOptions,
	atom,
	type Listener,
	type Unsubscribe,
} from './atom';
export { batch, untracked } from './batch';
export { createRivaClient, RivaClient } from './client';
export {
	type Computed,
	type ComputedOptions,
	computed,
	type Getter,
	type Readable,
} from './computed';
export { effect } from './effect';
export { RivaError, RivaScopeError } from './errors';
export { setDefaultClient } from './scope';
