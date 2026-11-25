import {
	type Computed,
	type Riva,
	RivaAbortError,
	type Signal,
} from '@softistx/riva';
import type { Resource } from '@softistx/riva/resource';

/**
 * What a call takes as input: a plain value, a riva signal or computed, or a
 * function that reads signals (tracked: when what it reads changes, the
 * resource follows).
 */
export type InputArg<Input> =
	| Input
	| Signal<Input>
	| Computed<Input>
	| (() => Input);

/** Resolves an `InputArg`; called inside the resource's tracked source. */
export function inputReader<Input>(
	riva: Riva,
	input: InputArg<Input>,
): () => Input {
	if (typeof input === 'function') return input as () => Input;
	const kind = (input as { kind?: unknown } | null)?.kind;
	if (typeof input === 'object' && (kind === 'signal' || kind === 'computed'))
		return () => riva.get(input as Signal<Input>);
	return () => input as Input;
}

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
