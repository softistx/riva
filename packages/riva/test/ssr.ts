import { createRivaClient } from '../src/client';
import type { Scheduler } from '../src/env';

/** A client over a fake clock (spec helper). */
export function fakeEnv(start = 1_000_000) {
	let t = start;
	let id = 0;
	const timers = new Map<number, { at: number; fn: () => void }>();
	const sched: Scheduler & { advance(ms: number): void } = {
		now: () => t,
		setTimeout(fn, ms) {
			timers.set(++id, { at: t + ms, fn });
			return id;
		},
		clearTimeout: (h) => void timers.delete(h as number),
		advance(ms) {
			t += ms;
			for (const [k, x] of [...timers])
				if (x.at <= t) {
					timers.delete(k);
					x.fn();
				}
		},
	};
	return { sched, client: () => createRivaClient({ scheduler: sched }) };
}

export const settle = () => new Promise<void>((r) => setImmediate(r));
