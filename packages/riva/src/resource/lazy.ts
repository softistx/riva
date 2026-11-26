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
 * a computed reader that is dropped stops the work at the next microtask
 * (unless it was read again by then).
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
	const node = nodeOf(riva.graph, view);
	const live = () => node.refs > 0;
	const touch = () => live() || stop?.();
	node.idle = () => queueMicrotask(touch);
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
			stop = undefined;
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
