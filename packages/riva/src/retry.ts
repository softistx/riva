import type { Scheduler } from './env';
import { RivaAbortError, RivaRequestError } from './errors';
import { isBrowser } from './scope';

/**
 * Whether a failed fetch is tried again. `failures` counts the failures
 * before this one (0 for the first). An abort and a non-retryable request
 * error never retry; any other error (unknown) does.
 */
export function shouldRetry(
	retry: number | ((failures: number, error: unknown) => boolean) | undefined,
	failures: number,
	error: unknown,
): boolean {
	if (error instanceof RivaAbortError) return false;
	if (error instanceof RivaRequestError && !error.retryable) return false;
	if (typeof retry === 'function') return retry(failures, error);
	return failures < (retry ?? (isBrowser() ? 3 : 0));
}

export const retryDelay = (
	fn: ((failures: number) => number) | undefined,
	failures: number,
): number => (fn ? fn(failures) : Math.min(1000 * 2 ** failures, 30_000));

/** Settles with `p`, or as soon as `signal` aborts (rejecting with `RivaAbortError`), even if `p` never settles. */
export function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(new RivaAbortError());
		if (signal.aborted) return onAbort();
		signal.addEventListener('abort', onAbort, { once: true });
		p.then(resolve, reject).finally(() =>
			signal.removeEventListener('abort', onAbort),
		);
	});
}

/** Waits `ms`, or until `signal` aborts (whichever comes first). */
export function sleep(
	sched: Scheduler,
	ms: number,
	signal: AbortSignal,
): Promise<void> {
	let h: unknown;
	if (signal.aborted) return Promise.resolve();
	return raceAbort(
		new Promise<void>((r) => (h = sched.setTimeout(r, ms))),
		signal,
	)
		.catch(() => {})
		.finally(() => sched.clearTimeout(h));
}
