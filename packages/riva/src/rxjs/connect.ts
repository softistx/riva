import type { Observable } from 'rxjs';
import type { Riva } from '../client';
import type { Signal } from '../signal';

/**
 * Writes each value of an Observable into a signal of one riva, and returns
 * the stop (idempotent) that unsubscribes.
 *
 * - `complete` leaves the last value in place;
 * - an `error` ends the connection and is swallowed: the signal keeps its last
 *   value. Handle it upstream (`catchError`) to turn it into a value.
 */
export function connect<T>(
	riva: Riva,
	state: Signal<T>,
	obs$: Observable<NoInfer<T>>,
): () => void {
	const sub = obs$.subscribe({
		next: (v) => riva.set(state, v),
		error: () => {},
	});
	return () => sub.unsubscribe();
}
