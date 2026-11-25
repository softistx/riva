import { active } from './scope';

/** Defers notifications until the outermost batch ends. Without a riva in scope, just runs `fn`. */
export const batch = <R>(fn: () => R): R => {
	const riva = active();
	return riva ? riva.batch(fn) : fn();
};

/** Reads without tracking. Without a riva in scope, just runs `fn`. */
export const untracked = <R>(fn: () => R): R => {
	const riva = active();
	return riva ? riva.untracked(fn) : fn();
};
