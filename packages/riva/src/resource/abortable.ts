import { RivaAbortError } from '../errors';
import type { Resource } from './resource';

/** A `signal` stops the wait of `await` (a `RivaAbortError`), not the shared fetch. */
export function abortable<D>(
	inner: Resource<D>,
	signal?: AbortSignal,
): Resource<D> {
	if (!signal) return inner;
	return {
		get state() {
			return inner.state;
		},
		subscribe: (l) => inner.subscribe(l),
		// biome-ignore lint/suspicious/noThenProperty: a resource is awaitable on purpose
		then: (onFulfilled, onRejected) =>
			new Promise<D>((resolve, reject) => {
				if (signal.aborted) return reject(new RivaAbortError());
				const abort = () => reject(new RivaAbortError());
				signal.addEventListener('abort', abort, { once: true });
				const done = () => signal.removeEventListener('abort', abort);
				inner.then(
					(d) => {
						done();
						resolve(d);
					},
					(e) => {
						done();
						reject(e);
					},
				);
			}).then(onFulfilled, onRejected),
	};
}
