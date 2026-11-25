import type { Riva } from '../client';
import { computed } from '../computed';
import { type Listener, signal, type Unsubscribe } from '../signal';
import { lazy } from './lazy';
import { IDLE, type ResourceState, sameState } from './types';

/** Opens a stream; `signal` aborts when the stream is stopped. */
export type StreamSource<D> = (signal: AbortSignal) => AsyncIterable<D>;

export interface StreamOptions<D> {
	/** A boolean, or a function read in a tracked computed. While false the state is `idle` and `source` is not called. Default true. */
	enabled?: boolean | (() => boolean);
	/** Each value, after the state was updated. A throw ends the stream and is raised outside it. */
	next?(data: D): void;
	/** The stream failed (it ends). */
	error?(error: unknown): void;
	/** The stream ended on its own (not by a stop, a restart or a failure). */
	complete?(): void;
}

/** A reactive view of a stream: no thenable, since a stream has no single result. */
export interface StreamResource<D> {
	readonly state: ResourceState<D>;
	subscribe(listener: Listener<ResourceState<D>>): Unsubscribe;
}

const LOADING: ResourceState<never> = Object.freeze({
	status: 'loading',
	data: undefined,
	error: undefined,
	isFetching: false,
	placeholder: false,
});

// What a callback throws is the app's: raised outside the stream.
const rethrow = (e: unknown) =>
	queueMicrotask(() => {
		throw e;
	});

/**
 * A resource over an async-iterable factory (a subscription). `source` runs
 * in a tracked computed and returns the factory: when what it reads changes,
 * the stream restarts. Lazy and browser-only, like `resource`: the first
 * reader opens the stream, the last one aborts it and calls `return()`. The
 * state is `loading` until the first value, then `success` with the last one;
 * a failure is `error` (the last value kept). A stream that ends without any
 * value goes back to `idle`.
 */
export function streamResource<D>(
	riva: Riva,
	source: () => StreamSource<D>,
	opts: StreamOptions<D> = {},
): StreamResource<D> {
	const { enabled = true } = opts;
	const target = computed<StreamSource<D> | undefined>(() =>
		(typeof enabled === 'function' ? !enabled() : !enabled)
			? undefined
			: source(),
	);
	const st = signal<ResourceState<D>>(LOADING);
	const view = computed<ResourceState<D>>(
		() => (riva.get(target) ? riva.get(st) : IDLE),
		{ equals: sameState },
	);
	const watch = lazy(riva, view, target, (factory, touch) => {
		const ctl = new AbortController();
		const { signal: abort } = ctl;
		let data: D | undefined;
		let has = false;
		const put = (
			status: 'loading' | 'success' | 'error',
			isFetching: boolean,
			error?: unknown,
		) =>
			riva.set(st, {
				status,
				data: has ? data : undefined,
				error,
				isFetching,
				placeholder: false,
			} as ResourceState<D>);
		let it: AsyncIterator<D> | undefined;
		const end = () => {
			ctl.abort();
			try {
				void Promise.resolve(it?.return?.()).catch(() => {});
			} catch {}
		};
		put('loading', true);
		void (async () => {
			try {
				it = factory(abort)[Symbol.asyncIterator]();
			} catch (e) {
				put('error', false, e);
				return opts.error?.(e);
			}
			for (;;) {
				let r: IteratorResult<D>;
				try {
					r = await it.next();
				} catch (e) {
					if (abort.aborted) return;
					put('error', false, e);
					touch();
					return opts.error?.(e);
				}
				if (abort.aborted) return;
				if (r.done) {
					if (has) put('success', false);
					else riva.set(st, IDLE);
					touch();
					return opts.complete?.();
				}
				data = r.value;
				has = true;
				put('success', true);
				touch();
				if (abort.aborted) return;
				try {
					opts.next?.(r.value);
				} catch (e) {
					end();
					return rethrow(e);
				}
			}
		})().catch(rethrow);
		return end;
	});
	return {
		get state() {
			return watch.read();
		},
		subscribe: watch.subscribe,
	};
}
