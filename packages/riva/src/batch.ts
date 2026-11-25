import { active } from './scope';

/** Defers notifications until the outermost batch ends. Without a client in scope, just runs `fn`. */
export const batch = <R>(fn: () => R): R => {
	const client = active();
	return client ? client.batch(fn) : fn();
};

/** Reads without tracking. Without a client in scope, just runs `fn`. */
export const untracked = <R>(fn: () => R): R => {
	const client = active();
	return client ? client.untracked(fn) : fn();
};
