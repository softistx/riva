import { Observable } from 'rxjs';

/** An async iterable, or a factory that gets a signal aborted when the subscriber leaves. */
export type AsyncSource<T> =
	| AsyncIterable<T>
	| ((signal: AbortSignal) => AsyncIterable<T>);

/**
 * A cold Observable over an async iterable (a GraphQL subscription, for one).
 * Each subscription opens its own iterator; unsubscribing calls its `return()`
 * and, when `source` is a factory, aborts the signal it was given. A failure
 * is `error`, the end is `complete`.
 */
export function fromAsyncIterable<T>(source: AsyncSource<T>): Observable<T> {
	return new Observable<T>((sub) => {
		const ctl = new AbortController();
		const it = (typeof source === 'function' ? source(ctl.signal) : source)[
			Symbol.asyncIterator
		]();
		let closed = false;
		(async () => {
			try {
				for (;;) {
					const r = await it.next();
					if (closed) return;
					if (r.done) return sub.complete();
					sub.next(r.value);
				}
			} catch (e) {
				if (!closed) sub.error(e);
			}
		})();
		return () => {
			closed = true;
			ctl.abort();
			Promise.resolve(it.return?.()).catch(() => {});
		};
	});
}
