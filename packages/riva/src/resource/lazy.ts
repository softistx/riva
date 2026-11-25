import type { Riva } from '../client';
import type { Computed } from '../computed';
import { nodeOf } from '../graph';
import { isBrowser } from '../scope';
import type { Listener, Unsubscribe } from '../signal';

/**
 * Starts a resource's work (`open`) at its first reader and stops it at the
 * last. A reader is a `subscribe` call or a computed or effect that reads
 * `read()` and is itself observed; nothing runs on the server or with no
 * reader. `open` runs again for each value of `target` (not undefined) and
 * its result is undone before the next. An explicit unsubscribe stops at once;
 * a computed reader that is dropped is noticed at the next `touch` (call it
 * whenever the work reports something).
 * @internal
 */
export function lazy<S, T>(
	riva: Riva,
	view: Computed<S>,
	target: Computed<T | undefined>,
	open: (t: T, touch: () => void) => Unsubscribe,
) {
	let stop: Unsubscribe | undefined;
	let queued = false;
	const live = () => nodeOf(riva.graph, view).refs > 0;
	const touch = () => {
		if (!stop || live()) return;
		const s = stop;
		stop = undefined;
		s();
	};
	const begin = () => {
		queued = false;
		if (stop || !isBrowser() || !live()) return;
		let cur: Unsubscribe | undefined;
		const swap = (t: T | undefined) => {
			cur?.();
			cur = t === undefined ? undefined : open(t, touch);
		};
		swap(riva.untracked(() => riva.get(target)));
		const off = riva.subscribe(target, swap);
		stop = () => {
			off();
			cur?.();
		};
	};
	return {
		read(): S {
			if (riva.graph.track && !stop && !queued) {
				queued = true;
				queueMicrotask(begin);
			}
			return riva.get(view);
		},
		subscribe(listener: Listener<S>): Unsubscribe {
			const off = riva.subscribe(view, listener);
			begin();
			return () => {
				off();
				touch();
			};
		},
	};
}
